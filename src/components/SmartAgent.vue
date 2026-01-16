<template scoped>
  <div class="background"></div>

  <!-- Status Notification Toast -->
  <div
    v-if="statusNotification.show"
    class="status-notification"
    :class="'is-' + statusNotification.type"
  >
    <span class="material-symbols-outlined mr-2">
      {{
        statusNotification.type === "success"
          ? "check_circle"
          : statusNotification.type === "danger"
            ? "error"
            : "info"
      }}
    </span>
    {{ statusNotification.message }}
  </div>

  <div class="models__deployment column is-8 is-paddingless">
    <div class="models__deployment-install">
      <div class="columns">
        <div class="column is-12 p-5">
          <!-- Header -->
          <div class="level mb-5">
            <div class="level-left">
              <h1 class="fira-sans-condensed-black-italic has-text-white">
                <span
                  class="material-symbols-outlined mr-2"
                  style="font-size: 64px"
                >
                  finance_mode
                </span>
                Prediction Capital Markets
              </h1>
            </div>
          </div>

          <!-- Tabs -->
          <div class="tabs is-large is-fullwidth mb-5">
            <ul>
              <li :class="{ 'is-active': activeTab === 'buy' }">
                <a
                  @click.prevent="activeTab = 'buy'"
                  class="fira-sans-condensed-black-italic is-size-1"
                >
                  <span class="material-symbols-outlined mr-2 is-size-1">
                    shopping_cart
                  </span>
                  Buy
                </a>
              </li>
              <li :class="{ 'is-active': activeTab === 'sell' }">
                <a
                  @click.prevent="activeTab = 'sell'"
                  class="fira-sans-condensed-black-italic is-size-1"
                >
                  <span class="material-symbols-outlined mr-2 is-size-1">
                    storefront
                  </span>
                  Sell
                </a>
              </li>
              <li :class="{ 'is-active': activeTab === 'run' }">
                <a
                  @click.prevent="activeTab = 'run'"
                  class="fira-sans-condensed-black-italic is-size-1"
                >
                  <span class="material-symbols-outlined mr-2 is-size-1">
                    auto_read_play
                  </span>
                  Run
                </a>
              </li>
            </ul>
          </div>

          <!-- BUY TAB -->
          <div v-if="activeTab === 'buy'">
            <div class="models__activity--payouts mb-5">
              <h2
                class="fira-sans-condensed-black-italic is-size-2 has-text-white has-text-left mb-5"
              >
                Smart Markets
              </h2>
              <hr />
              <div v-if="marketProjects.length > 0">
                <div
                  v-for="proj in marketProjects"
                  :key="'dsla_' + proj.name"
                  class="columns is-8 is-multiline control mt-5 mb-5 has-text-left"
                >
                  <div class="bonzai__agent column is-6">
                    <input
                      v-model="selectedProject"
                      :value="proj.name"
                      :id="'project_' + proj.name"
                      type="radio"
                      name="project"
                    />
                    <label
                      :for="'project_' + proj.name"
                      class="radio p-3 is-size-5"
                      style="width: 100%;"
                      @click.prevent="toggleProjectDescription(proj.name)"
                    >
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 24px !important"
                      >
                        finance_mode
                      </span>
                      {{ proj.name }}
                      <div class="tags has-addons">
                        <span
                          class="tag partner fira-sans-condensed-black-italic is-small"
                        >
                          {{ proj.token }}
                        </span>
                        <span
                          class="tag is-success partner fira-sans-condensed-black-italic is-small"
                        >
                          {{ proj.markets.length }} Markets
                        </span>
                        <span
                          v-if="
                            purchasedProtocols.some((p) => p.name === proj.name)
                          "
                          class="tag is-info partner fira-sans-condensed-black-italic is-small"
                        >
                          Owned
                        </span>
                      </div>
                    </label>
                  </div>
                  <div class="bonzai__agent column is-6">
                    <div class="control has-text-right">
                      <button
                        v-if="
                          !purchasedProtocols.some((p) => p.name === proj.name)
                        "
                        class="button chat is-success is-large"
                        @click="buyProjectAccess(proj.name)"
                      >
                        <span class="material-symbols-outlined is-size-3 mr-2">
                          shopping_cart
                        </span>
                        Buy Access
                        <div class="tags has-addons">
                          <span
                            class="tag is-warning partner fira-sans-condensed-black-italic is-medium"
                          >
                            {{ proj.accessPrice }} BONZAI
                          </span>
                        </div>
                      </button>
                      <button
                        v-else
                        class="button chat is-info is-large"
                        @click="
                          selectedRunProtocol = proj.name;
                          selectedRunAgent = null;
                          activeTab = 'run';
                        "
                      >
                        <span class="material-symbols-outlined is-size-3 mr-2">
                          auto_read_play
                        </span>
                        Run Protocol
                      </button>
                    </div>
                  </div>
                  <div
                    v-show="expandedProjectDescription === proj.name"
                    class="bonzai__agent-description column is-12 description-animate"
                  >
                    <div class="notification is-success description mt-5">
                      <h3
                        class="fira-sans-condensed-black-italic is-size-4 mt-5 mb-3"
                      >
                        <span class="material-symbols-outlined mr-2 is-size-3">
                          storefront
                        </span>
                        {{ proj.useCase }}
                      </h3>
                      <p>{{ proj.description }}</p>
                      <div class="mt-4">
                        <h4
                          class="fira-sans-condensed-black-italic is-size-5 mb-2"
                        >
                          Prediction Markets
                        </h4>
                        <ul class="sla-list">
                          <li v-for="(market, idx) in proj.markets" :key="idx">
                            {{ market.question }}
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div
                v-else
                class="notification is-info p-6"
                style="margin-top: 1.25rem"
              >
                <span class="fira-sans-condensed-black-italic is-size-4">
                  No Prediction Market available.
                </span>
                <div class="control has-text-center mt-5">
                  <button
                    class="button chat is-success is-large"
                    @click.prevent="activeTab = 'sell'"
                  >
                    <span class="material-symbols-outlined is-size-3 mr-2">
                      storefront
                    </span>
                    Launch Market
                    <div class="tags has-addons">
                      <span
                        class="tag is-warning partner fira-sans-condensed-black-italic is-medium"
                      >
                        1 ETH
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <!-- Smart Agents Section -->
            <div class="models__activity--payouts">
              <h2
                class="fira-sans-condensed-black-italic is-size-2 has-text-white has-text-left mb-5"
              >
                Smart Agents
              </h2>
              <hr />
              <div class="columns mt-5">
                <div class="column is-12">
                  <div
                    class="columns is-8 is-multiline control mb-5 has-text-left"
                  >
                    <div class="bonzai__agent column is-6 is-size-5">
                      <input
                        v-model="selectedAgent"
                        value="copymaster"
                        id="agent_copymaster"
                        type="radio"
                        name="agent"
                      />
                      <label
                        for="agent_copymaster"
                        class="radio p-4"
                        style="width: 100%;"
                        @click.prevent="toggleAgentDescription('copymaster')"
                      >
                        Polymarket Copy-Trading
                        <div class="tags has-addons">
                          <span
                            class="tag is-info partner fira-sans-condensed-black-italic is-small"
                          >
                            Finance
                          </span>
                          <span
                            v-if="purchasedAgents.includes('copymaster')"
                            class="tag is-success partner fira-sans-condensed-black-italic is-small"
                          >
                            Owned
                          </span>
                        </div>
                      </label>
                    </div>
                    <div class="bonzai__agent column is-6">
                      <div class="control has-text-right">
                        <button
                          v-if="!purchasedAgents.includes('copymaster')"
                          class="button chat is-success is-large"
                          @click="buyAgent('copymaster')"
                        >
                          <span
                            class="material-symbols-outlined is-size-3 mr-2"
                          >
                            shopping_cart
                          </span>
                          Buy Agent
                          <div class="tags has-addons">
                            <span
                              class="tag is-warning partner fira-sans-condensed-black-italic is-medium"
                            >
                              0.1 ETH
                            </span>
                          </div>
                        </button>
                        <button
                          v-else
                          class="button chat is-info is-large"
                          @click="activeTab = 'run'"
                        >
                          <span
                            class="material-symbols-outlined is-size-3 mr-2"
                          >
                            auto_read_play
                          </span>
                          Run Agent
                        </button>
                      </div>
                    </div>
                    <div
                      v-show="expandedAgentDescription === 'copymaster'"
                      class="bonzai__agent-description column is-12 description-animate"
                    >
                      <div class="notification is-success description mt-5">
                        <h3
                          class="fira-sans-condensed-black-italic is-size-4 mt-5 mb-3"
                        >
                          <span
                            class="material-symbols-outlined mr-2 is-size-3"
                          >
                            neurology
                          </span>
                          Strategy
                        </h3>
                        <p>
                          Identifies the hottest markets and top traders on
                          Polymarket, and suggests copy trades. You make the
                          final call and execute trades manually.
                        </p>
                      </div>
                    </div>
                  </div>

                  <!-- TCG Prediction Market Agent -->
                  <div
                    class="columns is-8 is-multiline control mb-5 has-text-left"
                  >
                    <div class="bonzai__agent column is-6 is-size-5">
                      <input
                        v-model="selectedAgent"
                        value="tcg"
                        id="agent_tcg"
                        type="radio"
                        name="agent"
                      />
                      <label
                        for="agent_tcg"
                        class="radio p-4"
                        style="width: 100%;"
                        @click.prevent="toggleAgentDescription('tcg')"
                      >
                        TCG Prediction Market
                        <div class="tags has-addons">
                          <span
                            class="tag is-warning partner fira-sans-condensed-black-italic is-small"
                          >
                            Trading Cards
                          </span>
                          <span
                            v-if="purchasedAgents.includes('tcg')"
                            class="tag is-success partner fira-sans-condensed-black-italic is-small"
                          >
                            Owned
                          </span>
                        </div>
                      </label>
                    </div>
                    <div class="bonzai__agent column is-6">
                      <div class="control has-text-right">
                        <button
                          v-if="!purchasedAgents.includes('tcg')"
                          class="button chat is-success is-large"
                          @click="buyAgent('tcg')"
                        >
                          <span
                            class="material-symbols-outlined is-size-3 mr-2"
                          >
                            shopping_cart
                          </span>
                          Buy Agent
                          <div class="tags has-addons">
                            <span
                              class="tag is-warning partner fira-sans-condensed-black-italic is-medium"
                            >
                              0.05 ETH
                            </span>
                          </div>
                        </button>
                        <button
                          v-else
                          class="button chat is-info is-large"
                          @click="
                            selectedRunAgent = 'tcg';
                            selectedRunProtocol = null;
                            activeTab = 'run';
                          "
                        >
                          <span
                            class="material-symbols-outlined is-size-3 mr-2"
                          >
                            auto_read_play
                          </span>
                          Run Agent
                        </button>
                      </div>
                    </div>
                    <div
                      v-show="expandedAgentDescription === 'tcg'"
                      class="bonzai__agent-description column is-12 description-animate"
                    >
                      <div class="notification is-success description mt-5">
                        <h3
                          class="fira-sans-condensed-black-italic is-size-4 mt-5 mb-3"
                        >
                          <span
                            class="material-symbols-outlined mr-2 is-size-3"
                          >
                            style
                          </span>
                          Features
                        </h3>
                        <p>
                          Build your TCG portfolio using real-time pricing from
                          JustTCG.com. Issue or join prediction markets on card
                          prices across Pokemon, Magic: The Gathering,
                          Yu-Gi-Oh!, One Piece, and Lorcana.
                        </p>
                        <div class="tcg-icons mt-3">
                          <span class="tag is-dark mr-2">Pokemon</span>
                          <span class="tag is-dark mr-2">MTG</span>
                          <span class="tag is-dark mr-2">Yu-Gi-Oh!</span>
                          <span class="tag is-dark mr-2">One Piece</span>
                          <span class="tag is-dark">Lorcana</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- SELL TAB -->
          <div v-if="activeTab === 'sell'">
            <div class="models__activity--payouts">
              <div class="bonzai__agent">
                <!-- Model Download Section -->
                <div
                  v-if="!isModelAvailable"
                  class="notification is-danger mb-5"
                >
                  <div class="columns is-vcentered">
                    <div class="column">
                      <p
                        class="fira-sans-condensed-black-italic is-size-5 mb-0"
                      >
                        <span
                          class="material-symbols-outlined mr-2"
                          style="vertical-align: middle"
                        >
                          error
                        </span>
                        AI Model Required
                      </p>
                    </div>
                    <div class="column is-narrow">
                      <button
                        class="button is-success is-large fira-sans-condensed-black-italic"
                        @click="downloadModel"
                        :disabled="isDownloading"
                      >
                        <span class="material-symbols-outlined mr-2">
                          deployed_code_update
                        </span>
                        Download
                        <span
                          v-if="downloadProgress"
                          class="filesize ml-2"
                          style="font-size: 14px"
                        >
                          {{ downloadProgress }}%
                        </span>
                        <span
                          v-else
                          class="filesize ml-2"
                          style="font-size: 14px"
                        >
                          4.08 GB
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Use Case Selection -->
                <h2
                  class="fira-sans-condensed-black-italic is-size-2 has-text-white has-text-left mb-4"
                >
                  Use Case
                </h2>
                <div class="columns">
                  <div class="column is-12">
                    <div class="control usecase-selector">
                      <template
                        v-for="useCase in dslaUseCases"
                        :key="useCase.key"
                      >
                        <input
                          type="radio"
                          name="usecase_selector"
                          :id="'usecase_' + useCase.key"
                          :value="useCase.key"
                          :checked="
                            selectedUseCase &&
                            selectedUseCase.key === useCase.key
                          "
                          :disabled="!isModelAvailable || isGenerating"
                          @change="selectUseCaseAndGenerate(useCase)"
                        />
                        <label
                          :for="'usecase_' + useCase.key"
                          class="radio"
                          :class="{
                            'is-loading':
                              isGenerating &&
                              selectedUseCase?.key === useCase.key,
                          }"
                        >
                          <span
                            v-if="
                              isGenerating &&
                              selectedUseCase?.key === useCase.key
                            "
                            class="material-symbols-outlined rotating mr-1"
                            style="font-size: 18px !important"
                          >
                            progress_activity
                          </span>
                          {{ useCase.label }}
                        </label>
                      </template>
                    </div>
                    <p
                      v-if="!isModelAvailable"
                      class="has-text-danger is-size-6 mt-2"
                    >
                      <span
                        class="material-symbols-outlined mr-1"
                        style="font-size: 16px; vertical-align: middle"
                      >
                        warning
                      </span>
                      Download the AI model above to enable use case selection.
                    </p>
                  </div>
                </div>
                <hr />

                <!-- Project Identity -->
                <h2
                  class="fira-sans-condensed-black-italic is-size-2 has-text-white has-text-left mb-4 mt-5"
                >
                  Project Identity
                </h2>
                <div class="columns">
                  <div class="field column is-6">
                    <label
                      class="label has-text-white has-text-left fira-sans-condensed-black-italic"
                    >
                      Project Name *
                    </label>
                    <div class="control">
                      <input
                        class="input is-large"
                        v-model="projectForm.name"
                        placeholder="AI-generated..."
                        :disabled="!selectedUseCase"
                      />
                    </div>
                  </div>
                  <div class="field column is-6">
                    <label
                      class="label has-text-white has-text-left fira-sans-condensed-black-italic"
                    >
                      Token Symbol *
                    </label>
                    <div class="control">
                      <input
                        class="input is-large"
                        v-model="projectForm.tokenSymbol"
                        placeholder="AI-generated..."
                        :disabled="!selectedUseCase"
                      />
                    </div>
                  </div>
                </div>
                <div class="field">
                  <label
                    class="label has-text-white has-text-left fira-sans-condensed-black-italic"
                  >
                    Project Description *
                  </label>
                  <div class="control">
                    <textarea
                      class="textarea is-large"
                      v-model="projectForm.description"
                      placeholder="AI-generated..."
                      :disabled="!selectedUseCase"
                    ></textarea>
                  </div>
                </div>

                <hr />

                <!-- Token Economics -->
                <h2
                  class="fira-sans-condensed-black-italic is-size-2 has-text-white has-text-left mb-4 mt-5"
                >
                  Token Economics
                </h2>
                <div class="columns">
                  <div class="field column is-4">
                    <label
                      class="label has-text-white has-text-left fira-sans-condensed-black-italic"
                    >
                      Total Supply
                    </label>
                    <div class="control">
                      <input
                        class="input is-large"
                        v-model="projectForm.totalSupply"
                        placeholder="AI-generated..."
                        :disabled="!selectedUseCase"
                      />
                    </div>
                  </div>
                  <div class="field column is-4">
                    <label
                      class="label has-text-white has-text-left fira-sans-condensed-black-italic"
                    >
                      Initial Liquidity (ETH)
                    </label>
                    <div class="control">
                      <input
                        class="input is-large"
                        v-model="projectForm.initialLiquidity"
                        placeholder="AI-generated..."
                        :disabled="!selectedUseCase"
                      />
                    </div>
                  </div>
                  <div class="field column is-4">
                    <label
                      class="label has-text-white has-text-left fira-sans-condensed-black-italic"
                    >
                      Access Price (BONZAI)
                    </label>
                    <div class="control">
                      <input
                        class="input is-large"
                        v-model="projectForm.accessPrice"
                        placeholder="AI-generated..."
                        :disabled="!selectedUseCase"
                      />
                    </div>
                  </div>
                </div>

                <hr />

                <!-- SLA-Based Markets -->
                <h2
                  class="fira-sans-condensed-black-italic is-size-2 has-text-white has-text-left mb-4 mt-5"
                >
                  Service Level Agreement Markets
                </h2>
                <p class="has-text-grey-light is-size-6 mb-4">
                  Each market is structured as: "Will [Asset/Service]'s [Metric]
                  [Operator] [Target] by [Date]?"
                </p>

                <div v-if="slaMarkets.length > 0" class="sla-markets">
                  <div
                    v-for="(sla, idx) in slaMarkets"
                    :key="idx"
                    class="sla-market-card mb-4"
                  >
                    <div class="sla-market-header">
                      <span
                        class="tag is-info fira-sans-condensed-black-italic mr-2"
                      >
                        SLA #{{ idx + 1 }}
                      </span>
                      <button
                        class="delete is-small"
                        @click="removeSlaMarket(idx)"
                      ></button>
                    </div>
                    <div class="columns mt-3">
                      <div class="field column is-3">
                        <label class="label has-text-white is-size-7">
                          Asset/Service
                        </label>
                        <input
                          class="input"
                          v-model="sla.asset"
                          placeholder="e.g. BAYC, Ethereum, Uniswap"
                        />
                      </div>
                      <div class="field column is-3">
                        <label class="label has-text-white is-size-7">
                          Metric
                        </label>
                        <input
                          class="input"
                          v-model="sla.metric"
                          placeholder="e.g. floor price, uptime, APY"
                        />
                      </div>
                      <div class="field column is-2">
                        <label class="label has-text-white is-size-7">
                          Operator
                        </label>
                        <div class="select is-fullwidth">
                          <select v-model="sla.operator">
                            <option value=">">&gt; (greater than)</option>
                            <option value="<">&lt; (less than)</option>
                            <option value=">=">&gt;= (at least)</option>
                            <option value="<=">&lt;= (at most)</option>
                            <option value="=">= (exactly)</option>
                          </select>
                        </div>
                      </div>
                      <div class="field column is-2">
                        <label class="label has-text-white is-size-7">
                          Target Value
                        </label>
                        <input
                          class="input"
                          v-model="sla.target"
                          placeholder="e.g. 50 ETH, 99.9%"
                        />
                      </div>
                      <div class="field column is-2">
                        <label class="label has-text-white is-size-7">
                          Target Date
                        </label>
                        <input class="input" type="date" v-model="sla.date" />
                      </div>
                    </div>
                    <div class="sla-preview mt-2">
                      <span
                        class="tag is-warning fira-sans-condensed-black-italic"
                      >
                        {{ formatSlaQuestion(sla) }}
                      </span>
                    </div>
                  </div>
                </div>

                <div v-else class="notification is-info has-text-centered">
                  <p class="pt-1">
                    <span class="material-symbols-outlined is-size-1">
                      wb_incandescent
                    </span>
                    Select a Use Case above to imagine a Prediction Market.
                  </p>
                </div>

                <hr />

                <!-- Launch Button -->
                <div class="control mt-4 has-text-centered mt-5">
                  <button
                    class="button is-success is-large mt-5"
                    @click="launchProject()"
                    :disabled="
                      !projectForm.name ||
                      !projectForm.tokenSymbol ||
                      slaMarkets.length === 0
                    "
                  >
                    <span class="material-symbols-outlined mr-2 is-size-3">
                      storefront
                    </span>
                    List Prediction Market
                    <div class="tags has-addons">
                      <span
                        class="tag is-warning partner fira-sans-condensed-black-italic"
                      >
                        1 ETH
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- RUN TAB -->
          <div v-if="activeTab === 'run'">
            <div>
              <!-- Protocol/Agent Selector -->
              <div class="models__activity--payouts mb-5">
                <div
                  v-if="!isModelAvailable"
                  class="notification is-danger mb-5"
                >
                  <div class="columns is-vcentered">
                    <div class="column">
                      <p
                        class="fira-sans-condensed-black-italic is-size-5 mb-0"
                      >
                        <span
                          class="material-symbols-outlined mr-2"
                          style="vertical-align: middle"
                        >
                          error
                        </span>
                        AI Model Required
                      </p>
                    </div>
                    <div class="column is-narrow">
                      <button
                        class="button is-success is-large fira-sans-condensed-black-italic"
                        @click="downloadModel"
                        :disabled="isDownloading"
                      >
                        <span class="material-symbols-outlined mr-2">
                          deployed_code_update
                        </span>
                        Download
                        <span
                          v-if="downloadProgress"
                          class="filesize ml-2"
                          style="font-size: 14px"
                        >
                          {{ downloadProgress }}%
                        </span>
                        <span
                          v-else
                          class="filesize ml-2"
                          style="font-size: 14px"
                        >
                          4.08 GB
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
                <h3
                  class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-2 mb-3"
                >
                  Smart Agent Portfolio
                </h3>
                <div class="control agent-selector">
                  <!-- Purchased DSLA Protocols -->
                  <template
                    v-for="protocol in purchasedProtocols"
                    :key="'run_' + protocol.name"
                  >
                    <input
                      type="radio"
                      name="agent_selector"
                      :id="'agent_' + protocol.name"
                      :value="protocol.name"
                      :checked="selectedRunProtocol === protocol.name"
                      @change="
                        selectedRunProtocol = protocol.name;
                        selectedRunAgent = null;
                      "
                    />
                    <label :for="'agent_' + protocol.name" class="radio">
                      {{ protocol.name }}
                    </label>
                  </template>
                  <!-- Polymarket Agent (if purchased) -->
                  <template v-if="purchasedAgents.includes('copymaster')">
                    <input
                      type="radio"
                      name="agent_selector"
                      id="agent_polymarket"
                      value="copymaster"
                      :checked="selectedRunAgent === 'copymaster'"
                      @change="
                        selectedRunAgent = 'copymaster';
                        selectedRunProtocol = null;
                      "
                    />
                    <label for="agent_polymarket" class="radio">
                      Polymarket Copy-Trading
                    </label>
                  </template>
                  <!-- TCG Agent (if purchased) -->
                  <template v-if="purchasedAgents.includes('tcg')">
                    <input
                      type="radio"
                      name="agent_selector"
                      id="agent_tcg_run"
                      value="tcg"
                      :checked="selectedRunAgent === 'tcg'"
                      @change="
                        selectedRunAgent = 'tcg';
                        selectedRunProtocol = null;
                        loadTcgTopCards();
                      "
                    />
                    <label for="agent_tcg_run" class="radio">
                      TCG Prediction Markets
                    </label>
                  </template>
                </div>
              </div>

              <hr />

              <!-- DSLA Protocol Trading Interface -->
              <div
                v-if="
                  selectedRunProtocol && getProtocolByName(selectedRunProtocol)
                "
                class="protocol-trading"
              >
                <div class="protocol-header mb-4">
                  <h2
                    class="fira-sans-condensed-black-italic has-text-white is-size-3"
                  >
                    {{ getProtocolByName(selectedRunProtocol).name }}
                  </h2>
                  <p class="has-text-grey-light">
                    {{ getProtocolByName(selectedRunProtocol).description }}
                  </p>
                  <div class="protocol-tags mt-2">
                    <span
                      class="tag is-warning fira-sans-condensed-black-italic is-medium"
                    >
                      {{ getProtocolByName(selectedRunProtocol).token }}
                    </span>
                    <span
                      class="tag is-info fira-sans-condensed-black-italic is-medium ml-2"
                    >
                      {{
                        getProtocolByName(selectedRunProtocol).markets.length
                      }}
                      Markets
                    </span>
                  </div>
                </div>

                <!-- SLA Markets for Trading (TCG Style) -->
                <div class="tcg-markets-section mt-5">
                  <h4
                    class="fira-sans-condensed-black-italic has-text-white is-size-4 mb-3 has-text-left"
                  >
                    <span class="material-symbols-outlined mr-2 is-size-1">
                      online_prediction
                    </span>
                    Active Prediction Markets
                  </h4>
                  <div class="tcg-markets-list">
                    <div
                      v-for="(market, mIdx) in getProtocolByName(
                        selectedRunProtocol
                      ).markets"
                      :key="mIdx"
                      class="tcg-market-card models__activity--payouts mt-5"
                    >
                      <div class="columns">
                        <div class="column is-8 has-text-left">
                          <div class="tcg-market-question pt-2">
                            <strong>{{ market.question }}</strong>
                          </div>
                          <div class="trading-market-details mt-3">
                            <span class="tag is-dark mr-2">{{
                              market.asset
                            }}</span>
                            <span class="tag is-dark mr-2">{{
                              market.metric
                            }}</span>
                            <span class="tag is-info mr-2">
                              {{ market.operator }} {{ market.target }}
                            </span>
                            <span class="tag is-warning">
                              {{ formatDate(market.date) }}
                            </span>
                          </div>
                          <!-- Position Display -->
                          <div
                            v-if="getPosition(selectedRunProtocol, mIdx)"
                            class="current-positions mt-3"
                          >
                            <span
                              v-if="
                                hasPosition(selectedRunProtocol, mIdx, 'for')
                              "
                              class="tag is-medium is-success fira-sans-condensed-black-italic mr-2"
                            >
                              FOR:
                              {{
                                getPosition(selectedRunProtocol, mIdx, "for")
                                  .amount
                              }}
                              {{ getProtocolByName(selectedRunProtocol).token }}
                            </span>
                            <span
                              v-if="
                                hasPosition(selectedRunProtocol, mIdx, 'against')
                              "
                              class="tag is-medium is-danger fira-sans-condensed-black-italic"
                            >
                              AGAINST:
                              {{
                                getPosition(selectedRunProtocol, mIdx, "against")
                                  .amount
                              }}
                              {{ getProtocolByName(selectedRunProtocol).token }}
                            </span>
                          </div>
                        </div>
                        <div class="column is-2">
                          <button
                            class="button is-success fira-sans-condensed-black-italic is-fullwidth"
                            @click="
                              openPositionModal(
                                selectedRunProtocol,
                                mIdx,
                                'for',
                                market
                              )
                            "
                          >
                            <span class="material-symbols-outlined mr-1">
                              thumb_up
                            </span>
                            YES
                          </button>
                        </div>
                        <div class="column is-2">
                          <button
                            class="button is-danger fira-sans-condensed-black-italic is-fullwidth"
                            @click="
                              openPositionModal(
                                selectedRunProtocol,
                                mIdx,
                                'against',
                                market
                              )
                            "
                          >
                            <span class="material-symbols-outlined mr-1">
                              thumb_down
                            </span>
                            NO
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Polymarket Agent Interface -->
              <div v-else-if="selectedRunAgent === 'copymaster'">
                <div class="models__activity--payouts pt-5 pb-5" style="position: relative; bottom: -40px; z-index: 11;">
                  <!-- Time Period Selector -->
                  <h2
                    class="fira-sans-condensed-black-italic is-size-5 has-text-white has-text-left mb-4"
                  >
                    Timeframe
                  </h2>
                  <div class="columns">
                    <div class="column is-12">
                      <div class="control timeperiod-selector">
                        <template
                          v-for="period in polymarketPeriods"
                          :key="period.key"
                        >
                          <input
                            type="radio"
                            name="timeperiod_selector"
                            :id="'timeperiod_' + period.key"
                            :value="period.key"
                            :checked="polymarketTimePeriod === period.key"
                            :disabled="isAnalyzing"
                            @change="selectTimePeriodAndAnalyze(period.key)"
                          />
                          <label
                            :for="'timeperiod_' + period.key"
                            class="radio"
                            :class="{
                              'is-loading':
                                isAnalyzing &&
                                polymarketTimePeriod === period.key,
                            }"
                          >
                            <span
                              v-if="
                                isAnalyzing &&
                                polymarketTimePeriod === period.key
                              "
                              class="material-symbols-outlined rotating mr-1"
                              style="font-size: 18px !important"
                            >
                              progress_activity
                            </span>
                            {{ period.label }}
                          </label>
                        </template>
                      </div>
                    </div>
                  </div>

                  <!-- Min Conviction Selector -->
                  <h2
                    class="fira-sans-condensed-black-italic is-size-5 has-text-white has-text-left mb-4 mt-5"
                  >
                    Consensus
                  </h2>
                  <div class="columns">
                    <div class="column is-12">
                      <div class="control conviction-selector">
                        <template
                          v-for="level in polymarketConvictionLevels"
                          :key="level.key"
                        >
                          <input
                            type="radio"
                            name="conviction_selector"
                            :id="'conviction_' + level.key"
                            :value="level.key"
                            :checked="polymarketMinConviction === level.key"
                            :disabled="isAnalyzing"
                            @change="selectConvictionAndAnalyze(level.key)"
                          />
                          <label
                            :for="'conviction_' + level.key"
                            class="radio"
                            :class="{
                              'is-loading':
                                isAnalyzing &&
                                polymarketMinConviction === level.key,
                            }"
                          >
                            <span
                              v-if="
                                isAnalyzing &&
                                polymarketMinConviction === level.key
                              "
                              class="material-symbols-outlined rotating mr-1"
                              style="font-size: 18px !important"
                            >
                              progress_activity
                            </span>
                            {{ level.label }}
                          </label>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="analysisHistory.length > 0" class="analysis-history">
                  <div
                    v-for="(analysis, idx) in analysisHistory"
                    :key="idx"
                    class="models__activity--payouts mb-5"
                  >
                    <div v-if="analysis.error" class="notification is-danger">
                      <p>{{ analysis.error }}</p>
                    </div>

                    <!-- Top Traders Panel -->
                    <div
                      v-if="
                        analysis.topTraders && analysis.topTraders.length > 0
                      "
                      class="top-traders-panel mt-4 mb-4"
                    >
                      <h4
                        class="fira-sans-condensed-black-italic is-size-2 has-text-info mb-3"
                      >
                        <span class="material-symbols-outlined is-size-1 mr-2">
                          leaderboard
                        </span>
                        Leaderboard
                      </h4>
                      <div class="top-traders-tags columns is-multiline">
                        <div
                          v-for="(trader, tIdx) in analysis.topTraders.slice(
                            0,
                            10
                          )"
                          :key="tIdx"
                          class="tags has-addons mt-5 mb-5 column is-6 has-text-left"
                        >
                          <span
                            class="tag is-warning is-large fira-sans-condensed-black-italic m-0"
                          >
                            #{{ trader.rank }}
                          </span>
                          <span
                            class="tag is-dark is-large fira-sans-condensed-black-italic m-0"
                          >
                            {{
                              trader.proxyWallet
                                ? trader.proxyWallet.slice(0, 6) +
                                  "..." +
                                  trader.proxyWallet.slice(-4)
                                : "Unknown"
                            }}
                          </span>
                          <span
                            class="tag is-success is-large fira-sans-condensed-black-italic m-0"
                          >
                            ${{ formatNumber(trader.pnl) }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <hr />

                    <!-- Conviction Recommendations -->
                    <div
                      v-if="
                        analysis.recommendations &&
                        analysis.recommendations.length > 0
                      "
                      class="has-text-left"
                    >
                      <h4
                        class="fira-sans-condensed-black-italic is-size-2 has-text-success mt-3"
                      >
                      <span class="material-symbols-outlined is-size-1 mr-2">
                          online_prediction
                        </span>
                        High Conviction Positions
                      </h4>

                      <div
                        v-for="(rec, rIdx) in analysis.recommendations"
                        :key="rIdx"
                        class="market-card mt-4 mb-4"
                      >
                        <div class="market-question">
                          <span
                            class="material-symbols-outlined is-size-3 mr-2"
                          >
                            help_outline
                          </span>
                          <strong class="has-text-white is-size-4">
                            {{ rec.question }}
                          </strong>
                        </div>

                        <hr />

                        <div class="conviction-info mt-3">
                          <div class="tags has-addons">
                            <span
                              class="tag is-warning is-large fira-sans-condensed-black-italic"
                            >
                              {{ rec.outcome }}
                            </span>
                            <span
                              class="tag is-light is-large fira-sans-condensed-black-italic"
                            >
                              {{ rec.conviction.traderCount }} TOP PERFORMER
                              <span v-if="rec.conviction.traderCount > 1">
                                S
                              </span>
                              &nbsp;AGREE
                              <span v-if="rec.conviction.traderCount == 1">
                                S
                              </span>
                              &nbsp;FOR
                            </span>
                            <span
                              class="tag is-success is-large fira-sans-condensed-black-italic"
                            >
                              ${{ formatNumber(rec.conviction.totalSize) }}
                            </span>
                          </div>
                        </div>
                        <div class="is-pulled-right">
                          <h2
                            class="fira-sans-condensed-black-italic is-pulled-right"
                          >
                            {{ (rec.market.currentPrice * 100).toFixed(0) }}%
                          </h2>
                        </div>
                        <!-- Traders holding this position -->
                        <div
                          v-if="rec.traders && rec.traders.length > 0"
                          class="traders-holding mt-3"
                        >
                          <div class="tags">
                            <span
                              v-for="(t, tIdx) in rec.traders"
                              :key="tIdx"
                              class="tag is-dark fira-sans-condensed-black-italic"
                            >
                              {{
                                t.proxyWallet
                                  ? t.proxyWallet.slice(0, 6) +
                                    "..." +
                                    t.proxyWallet.slice(-4)
                                  : t.userName
                              }}
                              (${{ formatNumber(t.size) }})
                            </span>
                          </div>
                        </div>
                        <hr />
                        <div class="rec-action mt-3 p-0">
                          <button
                            class="button is-info is-medium fira-sans-condensed-black-italic mr-5"
                            @click="generateInvestmentThesis(idx, rIdx, rec)"
                            :disabled="
                              getThesis(idx, rIdx)?.loading || !isModelAvailable
                            "
                          >
                            <span
                              v-if="getThesis(idx, rIdx)?.loading"
                              class="material-symbols-outlined mr-1 rotating"
                              style="font-size: 16px"
                            >
                              progress_activity
                            </span>
                            <span v-else class="material-symbols-outlined mr-2">
                              neurology
                            </span>
                            {{
                              getThesis(idx, rIdx)?.loading
                                ? "Analyzing..."
                                : "Generate Thesis"
                            }}
                          </button>
                          <button
                            class="button is-success is-medium fira-sans-condensed-black-italic"
                            @click="openPolymarket(rec.slug)"
                          >
                            <span class="material-symbols-outlined mr-2">
                              open_in_new
                            </span>
                            Predict on Polymarket
                          </button>
                        </div>
                        <hr v-if="getThesis(idx, rIdx)?.thesis" />
                        <!-- Investment Thesis Display -->
                        <div
                          v-if="getThesis(idx, rIdx)?.thesis"
                          class="investment-thesis mt-5"
                        >
                          <h3
                            class="thesis-header is-size-4 fira-sans-condensed-black-italic"
                          >
                            <span
                              class="material-symbols-outlined is-size-3 mr-2"
                            >
                              neurology
                            </span>
                            Generative Investment Thesis
                          </h3>
                          <div class="thesis-content has-text-white">
                            <vue-markdown
                              :source="getThesis(idx, rIdx).thesis"
                            />
                          </div>
                        </div>
                        <div
                          v-if="getThesis(idx, rIdx)?.error"
                          class="notification is-danger is-light mt-3"
                        >
                          <p>{{ getThesis(idx, rIdx).error }}</p>
                        </div>
                      </div>
                    </div>

                    <div
                      v-else-if="!analysis.error"
                      class="no-recommendations mt-3"
                    >
                      <span class="has-text-grey-light is-size-6">
                        <span
                          class="material-symbols-outlined mr-1"
                          style="font-size: 16px"
                        >
                          info
                        </span>
                        No positions found with
                        {{ analysis.meta?.minConviction || 2 }}+ traders
                        agreeing.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- TCG Agent Interface -->
              <div v-else-if="selectedRunAgent === 'tcg'" class="tcg-interface">
                <!-- Collection Selector -->
                <div class="tcg-header mb-4">
                  <div class="control collection-selector">
                    <template v-for="col in tcgCollections" :key="col.id">
                      <input
                        type="radio"
                        name="tcg_collection"
                        :id="'tcg_col_' + col.id"
                        :value="col.id"
                        :checked="selectedTcgCollection === col.id"
                        @change="
                          selectedTcgCollection = col.id;
                          loadTcgTopCards();
                        "
                      />
                      <label :for="'tcg_col_' + col.id" class="radio">
                        <span
                          class="material-symbols-outlined mr-1"
                          style="font-size: 24px !important"
                        >
                          {{ col.icon }}
                        </span>
                        {{ col.name }}
                      </label>
                    </template>
                  </div>
                </div>

                <div class="columns">
                  <!-- Left: Top Cards & Search -->
                  <div class="column is-7">
                    <div class="tcg-section models__activity--payouts">
                      <!-- Search -->
                      <div class="field has-addons mb-4">
                        <div class="control is-expanded">
                          <input
                            class="input no-shadow"
                            type="text"
                            v-model="tcgSearchQuery"
                            placeholder="Search cards..."
                            @input="searchTcgCards"
                          />
                        </div>
                        <div class="control">
                          <button
                            class="button is-info no-shadow"
                            @click="searchTcgCards"
                          >
                            <span class="material-symbols-outlined">
                              search
                            </span>
                          </button>
                        </div>
                      </div>

                      <!-- Loading -->
                      <div v-if="isTcgLoading" class="has-text-centered p-5">
                        <span
                          class="material-symbols-outlined rotating"
                          style="font-size: 64px"
                        >
                          progress_activity
                        </span>
                      </div>

                      <!-- Search Results -->
                      <div
                        v-else-if="tcgSearchResults.length > 0"
                        class="tcg-cards has-text-left"
                      >
                        <p class="has-text-grey-light is-size-7 mb-2">
                          Search Results:
                        </p>
                        <div
                          v-for="card in tcgSearchResults"
                          :key="card.id"
                          class="tcg-card-item"
                        >
                          <div class="tcg-card-info">
                            <strong>{{ card.name }}</strong>
                            <span class="has-text-grey-light is-size-7 ml-2">
                              {{ card.set }}
                            </span>
                          </div>
                          <div class="tcg-card-actions">
                            <button
                              class="button is-small is-warning no-shadow"
                              @click="addToPortfolio(card)"
                              :disabled="
                                userTcgPortfolio.some((c) => c.id === card.id)
                              "
                            >
                              <span
                                class="material-symbols-outlined"
                                style="font-size: 16px"
                              >
                                add
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>

                      <!-- Top Cards -->
                      <div v-else class="tcg-cards has-text-left">
                        <div
                          v-for="card in tcgTopCards"
                          :key="card.id"
                          class="tcg-card-item"
                        >
                          <div class="tcg-card-info">
                            <strong>{{ card.name }}</strong>
                            <span class="has-text-grey-light is-size-7 ml-2">
                              {{ card.set }}
                            </span>
                            <span class="tag is-info is-small ml-2">
                              {{ card.rarity }}
                            </span>
                          </div>
                          <div class="tcg-card-actions">
                            <button
                              class="button is-warning no-shadow"
                              @click="addToPortfolio(card)"
                              :disabled="
                                userTcgPortfolio.some((c) => c.id === card.id)
                              "
                            >
                              <span
                                class="material-symbols-outlined"
                                style="font-size: 24px"
                              >
                                add
                              </span>
                            </button>
                          </div>
                        </div>
                        <div
                          v-if="tcgTopCards.length === 0"
                          class="has-text-centered p-5"
                        >
                          <p class="has-text-grey-light">
                            Select a collection to load cards
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Right: Your Portfolio -->
                  <div class="column is-5">
                    <div
                      class="tcg-section portfolio-section models__activity--payouts"
                    >
                      <h4
                        class="fira-sans-condensed-black-italic has-text-white is-size-4"
                      >
                        <span class="material-symbols-outlined is-size-1">
                          amp_stories
                        </span>
                        My Cards
                        <span class="tag is-info ml-2 is-pulled-right is-large">
                          {{ userTcgPortfolio.length }} cards
                        </span>
                      </h4>

                      <div class="tcg-portfolio-cards mt-4">
                        <div
                          v-for="card in userTcgPortfolio"
                          :key="'portfolio-' + card.id"
                          class="tcg-portfolio-card pb-5"
                        >
                          <div class="portfolio-card-header">
                            <strong>
                              {{ card.collection }} — {{ card.name }}
                            </strong>
                          </div>
                          <hr />
                          <div class="portfolio-card-actions mt-2">
                            <button
                              class="button is-medium is-success fira-sans-condensed-black-italic mr-5"
                              @click="openTcgMarketModal(card)"
                            >
                              <span
                                class="material-symbols-outlined mr-1 is-size-1"
                              >
                                online_prediction
                              </span>
                              Issue Market
                            </button>
                            <button
                              class="button is-small is-danger"
                              @click="removeFromPortfolio(card.id)"
                            >
                              <span
                                class="material-symbols-outlined"
                                style="font-size: 14px"
                              >
                                cancel
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Active TCG Markets -->
                <div
                  v-if="tcgMarkets.length > 0"
                  class="tcg-markets-section mt-5"
                >
                  <h4
                    class="fira-sans-condensed-black-italic has-text-white is-size-4 mb-3 has-text-left"
                  >
                    <span class="material-symbols-outlined mr-2 is-size-1">
                      online_prediction
                    </span>
                    Active Prediction Markets
                  </h4>
                  <div class="tcg-markets-list">
                    <div
                      v-for="market in tcgMarkets"
                      :key="market.id"
                      class="tcg-market-card models__activity--payouts mt-5"
                    >
                      <div class="columns">
                        <div class="column is-8 has-text-left">
                          <div class="tcg-market-question pt-2">
                            <strong>{{ market.question }}</strong>
                          </div>
                        </div>
                        <div class="column is-2">
                          <button
                            class="button is-success fira-sans-condensed-black-italic is-fullwidth"
                            @click="joinTcgMarket(market.id, 'for', 10)"
                          >
                            <span class="material-symbols-outlined mr-1">
                              thumb_up
                            </span>
                            YES
                          </button>
                        </div>
                        <div class="column is-2">
                          <button
                            class="button is-danger fira-sans-condensed-black-italic is-fullwidth"
                            @click="joinTcgMarket(market.id, 'against', 10)"
                          >
                            <span class="material-symbols-outlined mr-1">
                              thumb_down
                            </span>
                            NO
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading Overlay -->
    <div v-if="isAnalyzing || isGenerating" class="loading-overlay">
      <div class="loading-content">
        <span
          class="material-symbols-outlined rotating is-size-1"
          style="font-size: 64px"
        >
          progress_activity
        </span>
        <p class="fira-sans-condensed-black-italic is-size-4 mt-3">
          {{ loadingMessage }}
        </p>
        <progress class="progress is-success mt-3" max="100"></progress>
        <button
          v-if="isGenerating"
          class="button is-danger mt-4 fira-sans-condensed-black-italic"
          @click="cancelGeneration"
        >
          <span class="material-symbols-outlined mr-2">close</span>
          Cancel Generation
        </button>
      </div>
    </div>

    <!-- Position Modal -->
    <div v-if="positionModal.show" class="modal is-active">
      <div class="modal-background" @click="closePositionModal"></div>
      <div class="modal-card">
        <header class="modal-card-head">
          <p class="modal-card-title fira-sans-condensed-black-italic">
            Open {{ positionModal.side.toUpperCase() }} Position
          </p>
          <button class="delete" @click="closePositionModal"></button>
        </header>
        <section class="modal-card-body">
          <p class="mb-4">{{ positionModal.market?.question }}</p>
          <div class="field">
            <label class="label">
              Amount ({{
                getProtocolByName(positionModal.protocol)?.token || "tokens"
              }})
            </label>
            <div class="control">
              <input
                class="input is-large"
                type="number"
                v-model="positionModal.amount"
                min="1"
                placeholder="Enter amount"
              />
            </div>
          </div>
          <p class="has-text-grey is-size-7 mt-3">
            You are betting that the SLA condition will
            <strong
              :class="
                positionModal.side === 'for'
                  ? 'has-text-success'
                  : 'has-text-danger'
              "
            >
              {{ positionModal.side === "for" ? "be met" : "NOT be met" }}
            </strong>
            by the target date.
          </p>
        </section>
        <footer class="modal-card-foot">
          <button
            class="button fira-sans-condensed-black-italic"
            :class="positionModal.side === 'for' ? 'is-success' : 'is-danger'"
            @click="confirmPosition"
            :disabled="!positionModal.amount || positionModal.amount <= 0"
          >
            <span class="material-symbols-outlined mr-2">check</span>
            Confirm Position
          </button>
          <button class="button" @click="closePositionModal">Cancel</button>
        </footer>
      </div>
    </div>

    <!-- TCG Market Creation Modal (LVL Style) -->
    <div
      v-if="tcgMarketModal.show"
      class="tcg-modal-overlay"
      @click.self="closeTcgMarketModal"
    >
      <div class="tcg-modal">
        <div class="has-text-right">
          <button
            class="button is-danger"
            @click="closeTcgMarketModal"
            title="Close"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="tcg-modal-header has-text-center">
          <span class="material-symbols-outlined is-size-1">
            online_prediction
          </span>
          <h2
            class="fira-sans-condensed-black-italic is-size-3 has-text-centered"
          >
            New Prediction Market
          </h2>
        </div>

        <div class="tcg-modal-body">
          <!-- Card Info Section -->
          <div v-if="tcgMarketModal.card" class="tcg-card-preview">
            <div class="tcg-modal-status mb-4">
              <span
                class="tcg-status-pill fira-sans-condensed-black-italic is-size-5"
              >
                {{ tcgMarketModal.card.name }}
              </span>
            </div>
            <div class="tcg-card-tags">
              <span class="tcg-tag fira-sans-condensed-black-italic">
                {{ tcgMarketModal.card.set }}
              </span>
              <span class="tcg-tag is-price fira-sans-condensed-black-italic">
                ${{ tcgMarketModal.card.price }}
              </span>
            </div>
          </div>

          <!-- Form Fields -->
          <div class="tcg-form-section has-text-left">
            <div class="tcg-field">
              <label class="tcg-label fira-sans-condensed-black-italic">
                Price Condition
              </label>
              <div class="tcg-select-wrapper">
                <select v-model="tcgMarketModal.operator" class="tcg-select">
                  <option value=">">&gt; (greater than)</option>
                  <option value="<">&lt; (less than)</option>
                  <option value=">=">&gt;= (at least)</option>
                  <option value="<=">&lt;= (at most)</option>
                  <option value="=">= (exactly)</option>
                </select>
              </div>
            </div>

            <div class="tcg-field mt-5">
              <label class="tcg-label fira-sans-condensed-black-italic">
                Target Price (USD)
              </label>
              <input
                class="tcg-input"
                type="number"
                v-model="tcgMarketModal.targetPrice"
                min="0"
                step="0.01"
                placeholder="Enter target price"
              />
            </div>

            <div class="tcg-field mt-5">
              <label class="tcg-label fira-sans-condensed-black-italic">
                Target Date
              </label>
              <input
                class="tcg-input"
                type="date"
                v-model="tcgMarketModal.targetDate"
              />
            </div>
          </div>

          <!-- Preview Section -->
          <div class="tcg-preview-box">
            <p class="tcg-preview-text p-0 m-0 has-text-centered">
              Will
              <strong>{{ tcgMarketModal.card?.name }}</strong>
              's market price
              {{
                tcgMarketModal.operator === ">"
                  ? "exceed"
                  : tcgMarketModal.operator === "<"
                    ? "fall below"
                    : tcgMarketModal.operator === ">="
                      ? "reach at least"
                      : tcgMarketModal.operator === "<="
                        ? "stay at or below"
                        : "equal exactly"
              }}
              <strong>${{ tcgMarketModal.targetPrice || "0.00" }}</strong>
              by
              <strong>{{ tcgMarketModal.targetDate || "TBD" }}</strong>
              ?
            </p>
          </div>
        </div>

        <div class="tcg-modal-footer mb-5">
          <button
            class="button tcg-primary-btn is-medium fira-sans-condensed-black-italic"
            @click="createTcgMarket"
            :disabled="
              !tcgMarketModal.targetPrice || !tcgMarketModal.targetDate
            "
          >
            <span class="material-symbols-outlined mr-2">
              online_prediction
            </span>
            Ask Now !
          </button>
          <button
            class="button is-danger is-medium"
            @click="closeTcgMarketModal"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted, watch } from "vue";
import VueMarkdown from "vue-markdown-render";
import polymarketAgent from "./polymarketAgent.js";
import tcgAgent from "./tcgAgent.js";

export default {
  name: "SmartAgent",
  components: { VueMarkdown },
  setup() {
    const activeTab = ref("buy");
    const selectedProject = ref("");
    const selectedAgent = ref("copymaster");
    const expandedAgentDescription = ref(null); // Track which agent description is expanded
    const expandedProjectDescription = ref(null); // Track which project description is expanded
    const statusNotification = ref({ show: false, message: "", type: "info" }); // For non-blocking notifications
    const isAnalyzing = ref(false);
    const isGenerating = ref(false);
    const isDownloading = ref(false);
    const polymarketTimePeriod = ref("WEEK");
    const polymarketMinConviction = ref(2);
    const downloadProgress = ref(0);
    const isModelAvailable = ref(false);
    const isModelLoaded = ref(false);
    const loadingMessage = ref("");
    const analysisHistory = ref([]);
    const investmentTheses = ref({}); // key: "analysisIdx-recIdx", value: { loading, thesis, error }
    const purchasedAgents = ref([]);
    const purchasedProtocols = ref([]);
    const selectedRunProtocol = ref(null);
    const selectedRunAgent = ref(null);
    const positions = ref({});
    const positionModal = reactive({
      show: false,
      protocol: null,
      marketIdx: null,
      side: null,
      market: null,
      amount: null,
    });
    const generationCancelled = ref(false);

    // TCG Agent State
    const tcgCollections = ref(tcgAgent.collections);
    const selectedTcgCollection = ref("pokemon");
    const tcgTopCards = ref([]);
    const tcgSearchQuery = ref("");
    const tcgSearchResults = ref([]);
    const userTcgPortfolio = ref([]);
    const tcgMarkets = ref([]);
    const isTcgLoading = ref(false);
    const tcgLoadingMessage = ref("");
    const tcgMarketModal = reactive({
      show: false,
      card: null,
      operator: ">",
      targetPrice: null,
      targetDate: "",
    });

    // Model config - using the same model as GenerativeText
    const modelConfig = {
      modelname: "LLaMA 3.1 8B",
      modeldesc:
        "8B-parameter LLaMA 3.1 instruct model from Meta with a 131,072-token context window. Modern, strong general-purpose assistant with good multilingual and coding performance. Best for: main local chat and coding assistant on a single recent GPU.",
      url: "https://huggingface.co/lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
      filename: "meta-llama-3.1-8b-instruct-q4_k_m.gguf",
      filesize: "4.92 GB",
      parameters: 8000000000,
      context: 131072,
    };

    const projectForm = reactive({
      name: "",
      tokenSymbol: "",
      description: "",
      totalSupply: "",
      initialLiquidity: "",
      accessPrice: "",
    });

    // Structured SLA markets
    const slaMarkets = ref([]);

    const dslaUseCases = [
      {
        key: "vol_returns",
        label: "Volatility of Returns",
        context: "DeFi yields, staking rewards, lending rates",
      },
      {
        key: "vol_availability",
        label: "Volatility of Availability",
        context: "blockchain uptime, API availability, node reliability",
      },
      {
        key: "vol_asset_floors",
        label: "Volatility of Asset Floors",
        context: "NFT floor prices, token minimums, collateral ratios",
      },
      {
        key: "vol_currency_pegs",
        label: "Volatility of Currency Pegs",
        context: "stablecoin pegs, wrapped token ratios, synthetic assets",
      },
      {
        key: "vol_response_time",
        label: "Volatility of Response Time",
        context: "block times, transaction confirmations, oracle updates",
      },
      {
        key: "vol_delivery_time",
        label: "Volatility of Delivery Time",
        context: "NFT mints, token distributions, airdrop claims",
      },
    ];
    const selectedUseCase = ref(null);
    const marketProjects = ref([]);

    const polymarketPeriods = [
      { key: "DAY", label: "Daily" },
      { key: "WEEK", label: "Weekly" },
      { key: "MONTH", label: "Monthly" },
      { key: "ALL", label: "All Time" },
    ];

    const polymarketConvictionLevels = [
      { key: 1, label: "1+" },
      { key: 2, label: "2+" },
      { key: 3, label: "3+" },
      { key: 4, label: "4+" },
      { key: 5, label: "5+" },
      { key: 6, label: "6+" },
      { key: 7, label: "7+" },
      { key: 8, label: "8+" },
      { key: 9, label: "9+" },
      { key: 10, label: "10" },
    ];

    const checkModelAvailability = async () => {
      if (window.electronAPI?.checkModel) {
        isModelAvailable.value = await window.electronAPI.checkModel(
          modelConfig.filename
        );
      }
    };

    const downloadModel = async () => {
      if (!window.electronAPI?.downloadModel) return;

      isDownloading.value = true;
      downloadProgress.value = 0;

      const removeListener = window.electronAPI.onDownloadProgress(
        (_event, progress) => {
          downloadProgress.value = Math.round(progress.percent * 100);
        }
      );

      try {
        const success = await window.electronAPI.downloadModel(
          modelConfig.url,
          modelConfig.filename
        );
        if (success) {
          isModelAvailable.value = true;
        }
      } catch (err) {
        console.error("Model download failed:", err);
      } finally {
        isDownloading.value = false;
        downloadProgress.value = 0;
        if (removeListener) removeListener();
      }
    };

    const loadModel = async () => {
      if (isModelLoaded.value) return;

      const payload = {
        modelname: modelConfig.modelname,
        filename: modelConfig.filename,
      };

      console.log("Loading model for SmartAgent:", payload);
      await window.electronAPI.loadModel(payload);
      isModelLoaded.value = true;
    };

    const loadPurchasedAgents = async () => {
      if (window.electronAPI?.store?.get) {
        const stored = await window.electronAPI.store.get(
          "purchasedAgents",
          []
        );
        purchasedAgents.value = stored || [];
      }
    };

    const savePurchasedAgents = async () => {
      if (window.electronAPI?.store?.set) {
        // Convert reactive array to plain array for IPC serialization
        const plainArray = [...purchasedAgents.value];
        await window.electronAPI.store.set("purchasedAgents", plainArray);
      }
    };

    const formatNumber = (num) => {
      if (!num) return "0";
      const n = Number(num);
      if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
      if (n >= 1000) return (n / 1000).toFixed(1) + "K";
      return n.toFixed(2);
    };

    const formatSlaQuestion = (sla) => {
      if (
        !sla.asset ||
        !sla.metric ||
        !sla.operator ||
        !sla.target ||
        !sla.date
      ) {
        return "Complete all fields to see the prediction question";
      }
      const operatorText = {
        ">": "exceed",
        "<": "fall below",
        ">=": "reach at least",
        "<=": "stay at or below",
        "=": "equal exactly",
      };
      const dateFormatted = new Date(sla.date).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      return `Will ${sla.asset}'s ${sla.metric} ${operatorText[sla.operator]} ${sla.target} by ${dateFormatted}?`;
    };

    const removeSlaMarket = (idx) => {
      slaMarkets.value.splice(idx, 1);
    };

    const addSlaMarket = () => {
      slaMarkets.value.push({
        asset: "",
        metric: "",
        operator: ">",
        target: "",
        date: "",
      });
    };

    const formatDate = (dateStr) => {
      if (!dateStr) return "";
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    };

    const getProtocolByName = (name) => {
      return purchasedProtocols.value.find((p) => p.name === name);
    };

    const getPosition = (protocolName, marketIdx, side = null) => {
      const key = `${protocolName}_${marketIdx}`;
      const pos = positions.value[key];
      if (!pos) return null;
      if (side) return pos[side] || null;
      return pos;
    };

    const hasPosition = (protocolName, marketIdx, side) => {
      const pos = getPosition(protocolName, marketIdx, side);
      return pos && pos.amount > 0;
    };

    const openPositionModal = (protocolName, marketIdx, side, market) => {
      positionModal.show = true;
      positionModal.protocol = protocolName;
      positionModal.marketIdx = marketIdx;
      positionModal.side = side;
      positionModal.market = market;
      positionModal.amount = null;
    };

    const closePositionModal = () => {
      positionModal.show = false;
      positionModal.protocol = null;
      positionModal.marketIdx = null;
      positionModal.side = null;
      positionModal.market = null;
      positionModal.amount = null;
    };

    const confirmPosition = () => {
      if (!positionModal.amount || positionModal.amount <= 0) return;

      const key = `${positionModal.protocol}_${positionModal.marketIdx}`;
      const protocol = getProtocolByName(positionModal.protocol);
      const side = positionModal.side;

      // Initialize position object if it doesn't exist
      if (!positions.value[key]) {
        positions.value[key] = { for: null, against: null };
      }

      // Store position for this side (allows both FOR and AGAINST)
      positions.value[key][side] = {
        amount: Number(positionModal.amount),
        market: positionModal.market?.question,
        timestamp: new Date().toISOString(),
      };

      showNotification(
        `Position opened: ${side.toUpperCase()} ${positionModal.amount} ${protocol?.token || "tokens"}`,
        "success"
      );

      closePositionModal();
    };

    const cancelGeneration = () => {
      generationCancelled.value = true;
      isGenerating.value = false;
      loadingMessage.value = "";
      selectedUseCase.value = null;
    };

    // Toggle agent description visibility
    const toggleAgentDescription = (agentId) => {
      selectedAgent.value = agentId;
      expandedAgentDescription.value =
        expandedAgentDescription.value === agentId ? null : agentId;
    };

    // Toggle project description visibility
    const toggleProjectDescription = (projectName) => {
      selectedProject.value = projectName;
      expandedProjectDescription.value =
        expandedProjectDescription.value === projectName ? null : projectName;
    };

    // Show status notification (replaces alert)
    const showNotification = (message, type = "info", duration = 3000) => {
      statusNotification.value = { show: true, message, type };
      if (duration > 0) {
        setTimeout(() => {
          statusNotification.value.show = false;
        }, duration);
      }
    };

    // TCG Agent Functions
    const loadTcgTopCards = async () => {
      isTcgLoading.value = true;
      tcgLoadingMessage.value = "Loading top cards...";
      try {
        const result = await tcgAgent.execute(
          { collection: selectedTcgCollection.value, topCount: 10 },
          {}
        );
        tcgTopCards.value = result.topCards;
      } catch (err) {
        console.error("Failed to load TCG cards:", err);
      } finally {
        isTcgLoading.value = false;
      }
    };

    const searchTcgCards = async () => {
      if (!tcgSearchQuery.value || tcgSearchQuery.value.length < 2) {
        tcgSearchResults.value = [];
        return;
      }
      isTcgLoading.value = true;
      tcgLoadingMessage.value = "Searching cards...";
      try {
        tcgSearchResults.value = await tcgAgent.searchCards(
          selectedTcgCollection.value,
          tcgSearchQuery.value
        );
      } catch (err) {
        console.error("Failed to search TCG cards:", err);
        tcgSearchResults.value = [];
      } finally {
        isTcgLoading.value = false;
      }
    };

    const addToPortfolio = (card) => {
      if (!userTcgPortfolio.value.find((c) => c.id === card.id)) {
        userTcgPortfolio.value.push({
          ...card,
          addedAt: new Date().toISOString(),
        });
      }
    };

    const removeFromPortfolio = (cardId) => {
      userTcgPortfolio.value = userTcgPortfolio.value.filter(
        (c) => c.id !== cardId
      );
    };

    const openTcgMarketModal = (card) => {
      tcgMarketModal.show = true;
      tcgMarketModal.card = card;
      tcgMarketModal.operator = ">";
      tcgMarketModal.targetPrice = Math.round(card.price * 1.1); // Default 10% above current
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 3);
      tcgMarketModal.targetDate = futureDate.toISOString().split("T")[0];
    };

    const closeTcgMarketModal = () => {
      tcgMarketModal.show = false;
      tcgMarketModal.card = null;
      tcgMarketModal.targetPrice = null;
      tcgMarketModal.targetDate = "";
    };

    const createTcgMarket = () => {
      if (
        !tcgMarketModal.card ||
        !tcgMarketModal.targetPrice ||
        !tcgMarketModal.targetDate
      ) {
        showNotification("Please fill in all fields", "warning");
        return;
      }

      const market = tcgAgent.createPredictionMarket(
        tcgMarketModal.card,
        tcgMarketModal.operator,
        tcgMarketModal.targetPrice,
        tcgMarketModal.targetDate
      );

      tcgMarkets.value.push(market);
      showNotification(`Market created: ${market.card.name}`, "success");
      closeTcgMarketModal();
    };

    const joinTcgMarket = (marketId, side, amount) => {
      const market = tcgMarkets.value.find((m) => m.id === marketId);
      if (!market) return;

      market.positions[side] += amount;
      showNotification(
        `Joined market ${side.toUpperCase()} with ${amount} tokens`,
        "success"
      );
    };

    const getCardMarkets = (cardId) => {
      return tcgMarkets.value.filter((m) => m.card.id === cardId);
    };

    const openPolymarket = (slug) => {
      let url = "https://polymarket.com";
      if (slug) {
        url = `https://polymarket.com/event/${slug}`;
      }
      if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(url);
      } else {
        window.open(url, "_blank");
      }
    };

    const selectTimePeriodAndAnalyze = (periodKey) => {
      polymarketTimePeriod.value = periodKey;
      runAnalysis();
    };

    const selectConvictionAndAnalyze = (convictionKey) => {
      polymarketMinConviction.value = convictionKey;
      runAnalysis();
    };

    const runAnalysis = async () => {
      isAnalyzing.value = true;
      loadingMessage.value = "Fetching top performers from leaderboard...";

      try {
        loadingMessage.value = "Analyzing top trader positions...";

        const result = await polymarketAgent.execute(
          {
            numTraders: 10,
            timePeriod: polymarketTimePeriod.value,
            minConviction: polymarketMinConviction.value,
            copyFraction: 0.1,
          },
          {}
        );

        loadingMessage.value = "Processing conviction signals...";

        if (result && Array.isArray(result.recommendations)) {
          const analysisEntry = {
            timestamp: new Date().toLocaleString(),
            topTraders: result.topTraders || [],
            recommendations: result.recommendations.map((rec) => ({
              question: rec.question,
              slug: rec.slug || "",
              outcome: rec.outcome,
              conviction: rec.conviction,
              traders: rec.traders || [],
              market: rec.market,
              suggestedSize: rec.suggestedSize,
            })),
            meta: result.meta,
          };

          // Replace analysis (no history)
          analysisHistory.value = [analysisEntry];
          // Clear any previous theses
          investmentTheses.value = {};
        }
      } catch (err) {
        console.error("Analysis error:", err);
        analysisHistory.value = [
          {
            timestamp: new Date().toLocaleString(),
            error: err.message || "Failed to analyze top performers",
            recommendations: [],
            topTraders: [],
          },
        ];
      } finally {
        isAnalyzing.value = false;
      }
    };

    const generateInvestmentThesis = async (analysisIdx, recIdx, rec) => {
      const key = `${analysisIdx}-${recIdx}`;

      // Check if model is available
      if (!isModelAvailable.value) {
        showNotification(
          "Please download the AI model first to generate investment theses.",
          "warning"
        );
        return;
      }

      // Set loading state
      investmentTheses.value[key] = {
        loading: true,
        thesis: null,
        error: null,
      };

      try {
        // Load model if not loaded
        if (!isModelLoaded.value) {
          await loadModel();
        }

        const traderInfo = rec.traders
          .map(
            (t) =>
              `- ${t.proxyWallet?.slice(0, 10) || "Unknown"}: $${t.size.toLocaleString()} position, ${t.pnl > 0 ? "+" : ""}$${t.pnl.toLocaleString()} PnL`
          )
          .join("\n");

        const prompt = `You are a prediction market analyst. Analyze this high-conviction position and provide a brief investment thesis.

MARKET: ${rec.question}
POSITION: ${rec.outcome}
CONVICTION: ${rec.conviction.traderCount} top-performing traders hold this position
TOTAL SIZE: $${rec.conviction.totalSize.toLocaleString()}
CURRENT PRICE: ${rec.market?.currentPrice ? (rec.market.currentPrice * 100).toFixed(0) + "%" : "N/A"}
END DATE: ${rec.market?.endDate || "N/A"}

TOP TRADERS HOLDING THIS POSITION:
${traderInfo}

Provide a concise investment thesis (3-4 sentences) explaining:
1. Why this might be a good bet based on the conviction signals
2. Key risks to consider
3. A brief recommendation

Keep it actionable and data-driven.`;

        const response = await window.electronAPI.chat(prompt);

        investmentTheses.value[key] = {
          loading: false,
          thesis: response,
          error: null,
        };
      } catch (err) {
        console.error("Thesis generation error:", err);
        investmentTheses.value[key] = {
          loading: false,
          thesis: null,
          error: err.message || "Failed to generate thesis",
        };
      }
    };

    const getThesis = (analysisIdx, recIdx) => {
      const key = `${analysisIdx}-${recIdx}`;
      return investmentTheses.value[key] || null;
    };

    const buyProjectAccess = (projectName) => {
      const project = marketProjects.value.find((p) => p.name === projectName);
      if (!project) {
        showNotification("Protocol not found", "danger");
        return;
      }

      // Check if already purchased
      if (purchasedProtocols.value.some((p) => p.name === projectName)) {
        showNotification(`You already own access to ${projectName}`, "info");
        selectedRunProtocol.value = projectName;
        activeTab.value = "run";
        return;
      }

      showNotification(
        `Purchasing access to ${projectName} for ${project.accessPrice} BONZAI...`,
        "info"
      );

      // Add to purchased protocols
      purchasedProtocols.value.push({ ...project });

      // Redirect to Run tab and select this protocol
      selectedRunProtocol.value = projectName;
      selectedRunAgent.value = null;
      activeTab.value = "run";
    };

    const buyAgent = async (agentId) => {
      const agentNames = {
        copymaster: "Polymarket Copy-Trading",
        tcg: "TCG Prediction Market",
      };
      showNotification(
        `Deploying ${agentNames[agentId] || agentId} agent...`,
        "success"
      );

      if (!purchasedAgents.value.includes(agentId)) {
        purchasedAgents.value.push(agentId);
        await savePurchasedAgents();
      }

      // Select this agent in Run tab
      selectedRunAgent.value = agentId;
      selectedRunProtocol.value = null;
      activeTab.value = "run";
    };

    const selectUseCaseAndGenerate = async (useCase) => {
      if (!isModelAvailable.value) {
        showNotification("Please download a model first.", "warning");
        return;
      }

      selectedUseCase.value = useCase;
      isGenerating.value = true;
      generationCancelled.value = false;
      loadingMessage.value = "Loading Artificial Intelligence";

      try {
        // Load model first
        await loadModel();
        if (generationCancelled.value) return;

        loadingMessage.value = "Generating Prediction Capital Market";

        // Generate project identity
        const identityPrompt = `You are a prediction market designer specializing in DSLA (Decentralized Service Level Agreements).

Generate a creative prediction market project for the use case: "${useCase.label}"
Context: This involves ${useCase.context}.

Respond ONLY with valid JSON, no explanations:
{
  "name": "single creative word name",
  "tokenSymbol": "3-4 letter symbol",
  "description": "2-3 sentence description of the market focus",
  "totalSupply": "number like 1000000000",
  "initialLiquidity": "number like 20",
  "accessPrice": "number like 5000"
}`;

        const identityResponse = await window.electronAPI.chat(identityPrompt);
        if (generationCancelled.value) return;
        console.log("Identity response:", identityResponse);

        if (identityResponse) {
          const jsonMatch = identityResponse.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            try {
              const data = JSON.parse(jsonMatch[0]);
              projectForm.name = data.name || "";
              projectForm.tokenSymbol = data.tokenSymbol || "";
              projectForm.description = data.description || "";
              projectForm.totalSupply = data.totalSupply || "";
              projectForm.initialLiquidity = data.initialLiquidity || "";
              projectForm.accessPrice = data.accessPrice || "";
            } catch (e) {
              console.error("Failed to parse identity JSON:", e);
            }
          }
        }

        loadingMessage.value = "Populating Initial Markets";

        // Generate SLA markets
        const slaPrompt = `Generate 3 specific Service Level Agreement prediction markets for: "${useCase.label}"
Context: ${useCase.context}

Each market must specify a real asset/service, a measurable metric, a comparison operator, a target value, and a future date (within the next 6-12 months from January 2026).

Respond ONLY with valid JSON array, no explanations:
[
  {"asset": "specific asset name", "metric": "measurable metric", "operator": ">", "target": "value with unit", "date": "YYYY-MM-DD"},
  {"asset": "specific asset name", "metric": "measurable metric", "operator": "<", "target": "value with unit", "date": "YYYY-MM-DD"},
  {"asset": "specific asset name", "metric": "measurable metric", "operator": ">=", "target": "value with unit", "date": "YYYY-MM-DD"}
]

Example for NFT floor prices:
[{"asset": "BAYC", "metric": "floor price", "operator": ">", "target": "50 ETH", "date": "2026-06-30"}]`;

        const slaResponse = await window.electronAPI.chat(slaPrompt);
        if (generationCancelled.value) return;
        console.log("SLA response:", slaResponse);

        if (slaResponse) {
          const arrayMatch = slaResponse.match(/\[[\s\S]*?\]/);
          if (arrayMatch) {
            try {
              const markets = JSON.parse(arrayMatch[0]);
              slaMarkets.value = markets.map((m) => ({
                asset: m.asset || "",
                metric: m.metric || "",
                operator: m.operator || ">",
                target: m.target || "",
                date: m.date || "",
              }));
            } catch (e) {
              console.error("Failed to parse SLA JSON:", e);
            }
          }
        }
      } catch (err) {
        console.error("Generation Failed:", err);
        showNotification(
          "Failed to generate your Prediction Capital Market. Please try again.",
          "danger"
        );
      } finally {
        isGenerating.value = false;
      }
    };

    const launchProject = () => {
      if (!projectForm.name || !projectForm.tokenSymbol) {
        showNotification(
          "Please fill in required fields: Project Name and Token Symbol",
          "warning"
        );
        return;
      }

      if (slaMarkets.value.length === 0) {
        showNotification("Please add at least one SLA market", "warning");
        return;
      }

      const markets = slaMarkets.value
        .filter((sla) => sla.asset && sla.metric && sla.target && sla.date)
        .map((sla) => ({
          asset: sla.asset,
          metric: sla.metric,
          operator: sla.operator,
          target: sla.target,
          date: sla.date,
          question: formatSlaQuestion(sla),
        }));

      marketProjects.value.push({
        name: projectForm.name,
        token: `$${projectForm.tokenSymbol.toUpperCase()}`,
        markets: markets,
        description: projectForm.description,
        useCase: selectedUseCase.value ? selectedUseCase.value.label : "Custom",
        accessPrice: projectForm.accessPrice || "10000",
      });

      showNotification(
        `${projectForm.name} launched successfully with ${markets.length} SLA markets!`,
        "success"
      );

      // Reset form
      projectForm.name = "";
      projectForm.tokenSymbol = "";
      projectForm.description = "";
      projectForm.totalSupply = "";
      projectForm.initialLiquidity = "";
      projectForm.accessPrice = "";
      slaMarkets.value = [];
      selectedUseCase.value = null;

      activeTab.value = "buy";
    };

    onMounted(async () => {
      await checkModelAvailability();
      await loadPurchasedAgents();
    });

    // Auto-run weekly analysis when copymaster agent is selected
    watch(selectedRunAgent, (newAgent) => {
      if (newAgent === "copymaster" && analysisHistory.value.length === 0) {
        // Run weekly analysis on first load
        runAnalysis();
      }
    });

    return {
      activeTab,
      selectedProject,
      selectedAgent,
      expandedAgentDescription,
      expandedProjectDescription,
      statusNotification,
      toggleAgentDescription,
      toggleProjectDescription,
      showNotification,
      isAnalyzing,
      isGenerating,
      isDownloading,
      downloadProgress,
      isModelAvailable,
      loadingMessage,
      analysisHistory,
      polymarketTimePeriod,
      polymarketPeriods,
      selectTimePeriodAndAnalyze,
      polymarketMinConviction,
      polymarketConvictionLevels,
      selectConvictionAndAnalyze,
      purchasedAgents,
      purchasedProtocols,
      selectedRunProtocol,
      selectedRunAgent,
      positions,
      positionModal,
      projectForm,
      slaMarkets,
      dslaUseCases,
      selectedUseCase,
      marketProjects,
      formatNumber,
      formatDate,
      formatSlaQuestion,
      removeSlaMarket,
      getProtocolByName,
      getPosition,
      hasPosition,
      openPositionModal,
      closePositionModal,
      confirmPosition,
      cancelGeneration,
      openPolymarket,
      runAnalysis,
      generateInvestmentThesis,
      getThesis,
      investmentTheses,
      buyProjectAccess,
      buyAgent,
      selectUseCaseAndGenerate,
      downloadModel,
      launchProject,
      // TCG Agent
      tcgCollections,
      selectedTcgCollection,
      tcgTopCards,
      tcgSearchQuery,
      tcgSearchResults,
      userTcgPortfolio,
      tcgMarkets,
      isTcgLoading,
      tcgLoadingMessage,
      tcgMarketModal,
      loadTcgTopCards,
      searchTcgCards,
      addToPortfolio,
      removeFromPortfolio,
      openTcgMarketModal,
      closeTcgMarketModal,
      createTcgMarket,
      joinTcgMarket,
      getCardMarkets,
    };
  },
};
</script>

<style scoped>
.material-symbols-outlined {
  border-radius: 100%;
  font-variation-settings:
    "FILL" 0,
    "wght" 100,
    "GRAD" -25,
    "opsz" 48;
}

.columns {
  position: relative !important;
}

.background {
  animation: move 40s ease infinite;
  background: url("../assets/bonzai_agent.jpg") no-repeat;
  background-size: cover;
  filter: blur(6px);
  height: 100%;
  overflow: hidden;
  position: absolute;
  width: 100%;
  z-index: -1;
}

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

.rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.models__deployment {
  background: transparent;
  margin: 0 !important;
  padding: 0 !important;
  position: relative;
}

.models__deployment-install {
  background: rgba(0, 0, 0, 0.5);
  height: 100vh;
  overflow-y: auto;
  padding: 4em;
}

.models__activity--payouts {
  backdrop-filter: blur(32px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px !important;
  padding: 4em;
}

.tabs li {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: rgba(255, 255, 255, 0.3);
}

.tabs li a {
  color: rgba(255, 255, 255, 0.3);
}
.tabs a:hover {
  border-color: rgba(255, 255, 255, 1) !important;
  color: rgba(255, 255, 255, 1) !important;
}
.tabs li.is-active a {
  border-color: #ffe08a;
  color: #ffe08a;
}

hr {
  background-color: rgba(255, 255, 255, 0.015);
  margin: 12px 0;
  width: 100%;
}

h1 {
  color: #fff;
  font-size: 64px;
  margin-top: 0 !important;
  text-align: right;
}
h2 {
  color: #fff;
  font-size: 48px;
  text-align: right;
}

p {
  color: #fff;
  font-family: "Fira Sans", sans-serif;
  font-size: 24px;
  font-style: normal;
  font-weight: 100;
  margin-bottom: 1em;
  text-align: justify;
}

.input,
textarea,
.select select {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 4px 4px 0 rgba(97, 55, 142, 0.4);
  color: #fff;
  resize: none;
}

.input:disabled,
textarea:disabled {
  background: rgba(255, 255, 255, 0.05);
  cursor: not-allowed;
  opacity: 0.5;
}

::placeholder {
  color: rgba(255, 255, 255, 0.3) !important;
}

input[type="radio"] {
  display: none;
}
input[type="radio"] + label {
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.3) !important;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  padding: 3px 12px 9px;
}
input[type="radio"]:checked + label {
  backdrop-filter: blur(64px) !important;
  background: rgba(97, 55, 142, 0.33) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  color: rgba(255, 255, 255, 1) !important;
}
input[type="radio"]:disabled + label.locked {
  cursor: pointer;
  opacity: 0.5;
}
input[type="radio"]:disabled + label.locked:hover {
  border-color: rgba(255, 255, 255, 0.5);
}

.agent-selector,
.collection-selector,
.usecase-selector,
.timeperiod-selector,
.conviction-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.agent-selector input[type="radio"] + label,
.collection-selector input[type="radio"] + label,
.usecase-selector input[type="radio"] + label,
.timeperiod-selector input[type="radio"] + label {
  flex: 0 0 calc(25% - 6px);
  justify-content: center;
  text-align: center;
  min-height: 44px;
  padding: 8px 12px;
}
.conviction-selector input[type="radio"] + label {
  flex: 0 0 calc(10% - 7.2px);
  justify-content: center;
  text-align: center;
  min-height: 44px;
  padding: 8px 12px;
}
input[type="radio"]:disabled + label {
  cursor: not-allowed;
  opacity: 0.4;
}

.tags {
  position: relative;
  text-shadow: none;
}

/* Agent selection label badge tags - positioned absolutely */
label.radio .tags {
  position: absolute;
  right: -16px;
  top: -16px;
}

/* Button badge tags */
.button .tags {
  position: absolute;
  right: -16px;
  top: -16px;
}

.button.is-selected {
  background: rgba(97, 55, 142, 0.33) !important;
  border-color: rgba(255, 255, 255, 1) !important;
  color: #ffffff !important;
}

/* Description toggle animation */
.description-animate {
  animation: fadeInUp 0.4s ease-out forwards;
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

/* Status Notification Toast */
.status-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 1em 1.5em;
  border-radius: 8px;
  display: flex;
  align-items: center;
  z-index: 10001;
  animation: slideInRight 0.3s ease-out;
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.status-notification.is-success {
  background: rgba(72, 199, 142, 0.95);
  color: #fff;
}

.status-notification.is-info {
  background: rgba(62, 142, 208, 0.95);
  color: #fff;
}

.status-notification.is-danger {
  background: rgba(241, 70, 104, 0.95);
  color: #fff;
}

.status-notification.is-warning {
  background: rgba(255, 224, 138, 0.95);
  color: #1a1a2e;
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(100px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.bonzai__agent-description .notification.is-success {
  background-color: rgba(72, 199, 142, 0.25) !important;
  border: 1px solid rgba(72, 199, 142, 0.9);
  color: #fff;
}

.bonzai__agent-description .notification p {
  font-weight: 300;
}

.sla-list {
  list-style: disc;
  margin-left: 1.5em;
}

.sla-list li {
  color: rgba(255, 255, 255, 0.9);
  font-size: 16px;
  margin-bottom: 0.5em;
}

.notification.is-danger {
  background: rgba(241, 70, 104, 0.2);
  border: 1px solid rgba(241, 70, 104, 0.6);
}

.notification.is-danger p {
  color: #f14668;
  font-size: 16px;
  margin-bottom: 0;
}

.filesize {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  padding: 2px 8px;
}

/* SLA Market Cards */
.sla-market-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-left: 4px solid #3e8ed0;
  border-radius: 6px;
  padding: 1em;
}

.sla-market-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.sla-preview {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 0.5em 1em;
}

.sla-preview .tag {
  font-size: 14px;
  height: auto;
  width: 100%;
  padding: 0.5em 1em;
  white-space: normal;
}

/* Analysis History */
.analysis-history {
  max-height: 60vh;
  overflow-y: auto;
}

.analysis-entry {
  backdrop-filter: blur(16px);
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 1.5em;
}

.analysis-header {
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  display: flex;
  font-size: 14px;
  margin-bottom: 1em;
  padding-bottom: 0.5em;
}

.market-card {
  margin: 2em 0 3em 0 !important;
  padding: 2em;
  backdrop-filter: blur(8px);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 3px solid #10b981;
  border-radius: 8px;
  padding: 1.5em;
}

.market-question {
  align-items: flex-start;
  color: #fff;
  display: flex;
  font-size: 24px;
  font-weight: 400;
  line-height: 1.4;
}

.market-question strong {
  flex: 1;
}
.market-volume {
  margin-top: 0.5em;
}

.market-description {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  line-height: 1.6;
  padding: 1em;
}

.market-description :deep(p) {
  font-size: 14px;
  margin-bottom: 0.5em;
  text-align: left;
}

/* Investment Thesis */
.investment-thesis {
  background: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.15),
    rgba(147, 51, 234, 0.15)
  );
  background: linear-gradient(
    135deg,
    rgba(155, 109, 200, 0.15),
    rgba(255, 153, 51, 0.33)
  );
  border: 1px solid rgba(255, 153, 51, 0.15);
  border-radius: 8px;
  padding: 1em;
}

.thesis-header {
  align-items: center;
  color: #fff;
  display: flex;
  margin-bottom: 0.75em;
}

.thesis-content * {
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  line-height: 2;
}

.thesis-content :deep(p) {
  margin-bottom: 0.5em;
  text-align: left;
}

.thesis-content :deep(ol),
.thesis-content :deep(ul) {
  margin-left: 1.5em;
  text-align: left;
}

/* Top Traders Tags */
ol.top-traders-tags {
  list-style-type: decimal !important;
  list-style: decimal;
}

.recommendations h4 {
  align-items: center;
  display: flex;
  font-size: 16px;
}

.recommendation-card {
  align-items: center;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75em;
  padding: 1em;
}

.rec-info {
  flex: 1;
}
.rec-trader {
  align-items: center;
  color: #fff;
  display: flex;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 0.5em;
}
.trader-name {
  font-family: monospace;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rec-position {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
}

.no-recommendations {
  align-items: center;
  display: flex;
}

/* Top Traders Panel */
.top-traders-panel {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 8px;
  padding: 1em;
}

.top-traders-panel h4 {
  align-items: center;
  display: flex;
  font-size: 14px;
}

.top-traders-panel .tags {
  flex-wrap: wrap;
  gap: 0.5em;
}

/* Conviction Info */
.conviction-info {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
}

/* Traders Holding Position */
.traders-holding {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 0.75em;
}

.traders-holding .tags {
  flex-wrap: wrap;
  gap: 0.5em;
}

.empty-state .notification {
  backdrop-filter: blur(16px);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.empty-state .notification.is-warning {
  background: rgba(255, 224, 138, 0.15);
  border: 1px solid rgba(255, 224, 138, 0.3);
}

.loading-overlay {
  align-items: center;
  backdrop-filter: blur(8px);
  background: rgba(0, 0, 0, 0.7);
  bottom: 0;
  display: flex;
  justify-content: center;
  left: 0;
  position: fixed;
  right: 0;
  top: 0;
  z-index: 1000;
}

.loading-content {
  text-align: center;
}
.loading-content .progress {
  width: 100%;
}

/* Run Tab Styles */
.run-selector {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 1.5em;
}

.run-selector h3 {
  font-size: 18px;
  text-align: left;
}

.run-selector .buttons {
  flex-wrap: wrap;
  gap: 0.75em;
}

.run-selector .button {
  margin: 0;
}

.run-selector .button .tag {
  position: static;
}

.protocol-header h2 {
  font-size: 32px;
  text-align: left;
}

.protocol-header p {
  font-size: 16px;
  text-align: left;
}

.protocol-tags {
  display: flex;
}

.protocol-tags .tag {
  position: static;
}

/* Trading Market Cards */
.trading-market-card {
  backdrop-filter: blur(8px);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-left: 4px solid #3e8ed0;
  border-radius: 8px;
  padding: 1.5em;
}

.trading-market-question {
  align-items: flex-start;
  color: #fff;
  display: flex;
  font-size: 18px;
  line-height: 1.4;
}

.trading-market-question strong {
  flex: 1;
}

.trading-market-details .tag {
  position: static;
}

.current-position .tag {
  position: static;
}

.trading-actions .button {
  font-size: 16px;
  padding: 1em 1.5em;
}

/* Modal Styles */
.modal-card {
  background: #1a1a2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  max-width: 500px;
}

.modal-card-head {
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-card-title {
  color: #fff;
}

.modal-card-body {
  background: #1a1a2e;
}

.modal-card-body p {
  color: rgba(255, 255, 255, 0.9);
  font-size: 16px;
  text-align: left;
}

.modal-card-body .label {
  color: rgba(255, 255, 255, 0.8);
}

.modal-card-body .input {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
}

.modal-card-foot {
  background: rgba(0, 0, 0, 0.3);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-background {
  background: rgba(0, 0, 0, 0.8);
}

/* TCG Market Modal (LVL Style) */
.tcg-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.tcg-modal {
  width: 92%;
  max-width: 520px;
  background: #0a0a0f;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px;
  position: relative;
  color: #fff;
}

.tcg-modal-header {
  text-align: center;
  margin-bottom: 18px;
}

.tcg-modal-header .material-symbols-outlined {
  color: #f59e0b;
  display: block;
  margin-bottom: 8px;
}

.tcg-modal-badge {
  display: inline-block;
  padding: 6px 16px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  border-radius: 20px;
  font-weight: 900;
  color: #fff;
  margin-bottom: 10px;
}

.tcg-modal-header h2 {
  margin: 0;
  color: #fff;
}

.tcg-modal-body {
  margin-bottom: 16px;
}

.tcg-card-preview {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  padding: 1.5em;
  border: 1px solid rgba(245, 158, 11, 0.25);
  margin-bottom: 16px;
  text-align: center;
}

.tcg-modal-status {
  margin-bottom: 10px;
}

.tcg-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 14px;
  border-radius: 999px;
  border: 2px solid rgba(245, 158, 11, 0.6);
  color: #f59e0b;
  font-size: 14px;
  font-weight: 600;
  background: rgba(245, 158, 11, 0.1);
  text-transform: uppercase;
}

.tcg-card-tags {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.tcg-tag {
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
}

.tcg-tag.is-price {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  font-weight: 600;
}

.tcg-form-section {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  padding: 1.5em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 16px;
}

.tcg-field {
  margin-bottom: 16px;
}

.tcg-field:last-child {
  margin-bottom: 0;
}

.tcg-label {
  display: block;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 8px;
  font-size: 14px;
}

.tcg-input,
.tcg-select {
  width: 100%;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #fff;
  font-size: 16px;
  transition: border-color 0.2s ease;
}

.tcg-input:focus,
.tcg-select:focus {
  outline: none;
  border-color: #f59e0b;
}

.tcg-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.tcg-select-wrapper {
  position: relative;
}

.tcg-select {
  appearance: none;
  cursor: pointer;
}

.tcg-select option {
  background: #1a1a2e;
  color: #fff;
}

.tcg-preview-box {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 10px;
  padding: 1em 1.25em;
}

.tcg-preview-box p:first-child {
  color: #f59e0b;
  margin-bottom: 8px;
  font-size: 13px;
}

.tcg-preview-text {
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  line-height: 1.5;
}

.tcg-preview-text strong {
  color: #f59e0b;
}

.tcg-modal-footer {
  display: flex;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.tcg-modal-footer .button {
  flex: 1;
  cursor: pointer;
}

.tcg-primary-btn {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  border: none;
  color: #fff;
}

.tcg-primary-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
}

.tcg-primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tcg-secondary-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #fff;
}

.tcg-secondary-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.3);
}

/* TCG Interface Styles */
.tcg-interface {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 1.5em;
}

.tcg-header .buttons {
  flex-wrap: wrap;
  gap: 0.5em;
}

.tcg-header .button {
  margin: 0;
}

.tcg-section {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 1.5em;
}

.no-shadow {
  box-shadow: none !important;
}

.tcg-section h4 {
  text-align: left;
}

.portfolio-section {
  max-height: 500px;
  overflow-y: auto;
}

.tcg-cards {
  max-height: 400px;
  overflow-y: auto;
}

.tcg-card-item {
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  display: flex;
  gap: 1em;
  justify-content: space-between;
  margin-bottom: 0.5em;
  padding: 0.75em 1em;
}

.tcg-card-info {
  flex: 1;
}

.tcg-card-info strong {
  color: #fff;
  text-transform: uppercase;
  font-size: 0.75em;
}

.tcg-card-price .tag {
  position: static;
}

.tcg-card-actions .button {
  padding: 0.25em 0.5em;
}

.tcg-portfolio-cards {
  max-height: 400px;
  overflow-y: auto;
}

.tcg-portfolio-card {
  background: rgba(255, 224, 138, 0.1);
  border: 1px solid rgba(255, 224, 138, 0.3);
  border-radius: 6px;
  margin-bottom: 0.75em;
  padding: 1em;
}

.portfolio-card-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  text-transform: uppercase;
  font-size: 0.75em;
}

.portfolio-card-header strong {
  color: #fff;
}

.portfolio-card-details .tag {
  position: static;
}

.card-markets {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 0.5em;
}

.card-market-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.5em 0;
}

.card-market-item:last-child {
  border-bottom: none;
}

.card-market-item p {
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  margin-bottom: 0;
  text-align: left;
}

.tcg-markets-section {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 1.5em;
}

.tcg-market-card {
  background: rgba(62, 142, 208, 0.1);
  border: 1px solid rgba(62, 142, 208, 0.2);
  border-bottom: 3px solid #3e8ed0;
  border-radius: 6px;
  margin-bottom: 1em;
  padding: 1.5em;
}

.tcg-market-question strong {
  color: #fff;
  font-size: 16px;
}

.tcg-market-details .tag,
.tcg-market-positions .tag {
  position: static;
}

.tcg-market-actions .button {
  font-size: 14px;
}

.tcg-icons .tag {
  position: static;
}

.current-positions .tag {
  position: static;
}
</style>
