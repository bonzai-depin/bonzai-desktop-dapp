<template scoped>
  <div class="background"></div>
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
              <!-- DSLA Prediction Markets Section -->
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
                  <div class="bonzai__agent column is-4">
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
                          class="tag partner fira-sans-condensed-black-italic is-medium"
                        >
                          {{ proj.token }}
                        </span>
                        <span
                          class="tag is-success partner fira-sans-condensed-black-italic is-medium"
                        >
                          {{ proj.markets }} Markets
                        </span>
                      </div>
                    </label>
                  </div>
                  <div class="bonzai__agent column is-8">
                    <div class="control has-text-right">
                      <button
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
                            {{ proj.accessPrice ? proj.accessPrice : "10K" }}
                            BONZAI
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                  <div class="bonzai__agent-description column is-12">
                    <div class="notification is-success description mt-5">
                      <h3
                        class="fira-sans-condensed-black-italic is-size-4 mt-5 mb-3"
                      >
                        <span class="material-symbols-outlined mr-2 is-size-3">
                          storefront
                        </span>
                        {{ proj.useCase }}
                      </h3>
                      <p>
                        {{ proj.description }}
                      </p>
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
                    <!-- Copy Master -->
                    <div class="bonzai__agent column is-6 is-size-5">
                      <input
                        v-model="selectedAgent"
                        value="copymaster"
                        id="agent_copymaster"
                        type="radio"
                        name="agent"
                      />
                      <label for="agent_copymaster" class="radio p-4">
                        Polymarket Copy-Trading
                        <div class="tags has-addons">
                          <span
                            class="tag is-success partner fira-sans-condensed-black-italic is-medium"
                          >
                            +13.37% (24H)
                          </span>
                          <span
                            class="tag is-info partner fira-sans-condensed-black-italic is-medium"
                          >
                            80% WIN
                          </span>
                        </div>
                      </label>
                    </div>
                    <div class="bonzai__agent column is-6">
                      <div class="control has-text-right">
                        <button
                          class="button chat is-success is-large"
                          @click="buyAgent('Copy Master')"
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
                      </div>
                    </div>
                    <div class="bonzai__agent-description column is-12">
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
                          Polymarket, uses AI to analyse event context, and
                          suggests copy trades. You make the final call.
                        </p>
                      </div>
                    </div>
                    <hr />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- SELL TAB -->
          <div v-if="activeTab === 'sell'">
            <div class="models__activity--payouts">
              <div class="bonzai__agent">
                <!-- DSLA Use Case Selection -->
                <h2
                  class="fira-sans-condensed-black-italic is-size-2 has-text-white has-text-left mb-4"
                >
                  Use Case
                </h2>
                <div class="columns">
                  <div class="column is-12">
                    <div class="buttons">
                      <button
                        style="width: 30%; margin: 0 3.33% 3% 0"
                        v-for="useCase in dslaUseCases"
                        :key="useCase.key"
                        class="button is-outlined is-info is-medium"
                        :class="{
                          'is-selected':
                            selectedUseCase &&
                            selectedUseCase.key === useCase.key,
                        }"
                        @click="
                          selectUseCase(useCase);
                          populateDSLAFields();
                        "
                      >
                        {{ useCase.label }}
                      </button>
                    </div>
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
                        placeholder="e.g. PoliMarket, CryptoOracle, SportsBet"
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
                        placeholder="e.g. POLI, CRYO, SPRT"
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
                      placeholder="Describe your prediction market focus, target audience, and unique value proposition..."
                    ></textarea>
                  </div>
                </div>
                <!-- <div class="control has-text-right mb-5">
                  <button
                    class="button is-info is-medium"
                    @click="generateWithAI('description')"
                  >
                    <span class="material-symbols-outlined mr-2">
                      psychology
                    </span>
                    Generate with AI
                  </button>
                </div> -->

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
                        placeholder="1000000000"
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
                        placeholder="10"
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
                        placeholder="10000"
                      />
                    </div>
                  </div>
                </div>
                <!-- <div class="control has-text-right mb-5">
                  <button
                    class="button is-info is-medium"
                    @click="generateWithAI('tokenomics')"
                  >
                    <span class="material-symbols-outlined mr-2">
                      calculate
                    </span>
                    AI Tokenomics Advisor
                  </button>
                </div> -->

                <hr />

                <!-- Initial Markets/SLAs -->
                <h2
                  class="fira-sans-condensed-black-italic is-size-2 has-text-white has-text-left mb-4 mt-5"
                >
                  Initial Markets / SLAs
                </h2>
                <div class="field">
                  <label
                    class="label has-text-white has-text-left fira-sans-condensed-black-italic"
                  >
                    Market Ideas (one per line)
                  </label>
                  <div class="control">
                    <textarea
                      class="textarea is-large"
                      v-model="projectForm.marketIdeas"
                      rows="6"
                      placeholder="Will Bitcoin reach $100k by end of 2025?\nWill AI generate 50% of code by 2026?\nWill fusion power be commercially viable by 2030?"
                    ></textarea>
                  </div>
                </div>
                <!-- <div class="control has-text-right mb-5">
                  <button
                    class="button is-info is-medium"
                    @click="generateWithAI('markets')"
                  >
                    <span class="material-symbols-outlined mr-2">
                      auto_awesome
                    </span>
                    AI Market Generator
                  </button>
                </div> -->

                <hr />

                <!-- Automation Pipeline -->
                <!-- <div class="models__activity--payouts has-text-right p-5 mt-5">
                  <label
                    class="label has-text-white has-text-left fira-sans-condensed-black-italic is-size-4 mb-4"
                  >
                    <span class="material-symbols-outlined mr-2">
                      settings_suggest
                    </span>
                    AI Automation Pipeline
                  </label>

                  <div class="columns is-multiline">
                    <div class="column is-6">
                      <label class="checkbox automation-checkbox">
                        <input
                          type="checkbox"
                          v-model="projectForm.automation.commentary"
                        />
                        <span class="material-symbols-outlined">article</span>
                        <span class="fira-sans-condensed-black-italic">
                          Automated Market Commentary
                        </span>
                      </label>
                    </div>
                    <div class="column is-6">
                      <label class="checkbox automation-checkbox">
                        <input
                          type="checkbox"
                          v-model="projectForm.automation.resolution"
                        />
                        <span class="material-symbols-outlined">
                          fact_check
                        </span>
                        <span class="fira-sans-condensed-black-italic">
                          AI-Powered Oracle Resolution
                        </span>
                      </label>
                    </div>
                    <div class="column is-6">
                      <label class="checkbox automation-checkbox">
                        <input
                          type="checkbox"
                          v-model="projectForm.automation.analytics"
                        />
                        <span class="material-symbols-outlined">analytics</span>
                        <span class="fira-sans-condensed-black-italic">
                          Real-Time Analytics Dashboard
                        </span>
                      </label>
                    </div>
                    <div class="column is-6">
                      <label class="checkbox automation-checkbox">
                        <input
                          type="checkbox"
                          v-model="projectForm.automation.social"
                        />
                        <span class="material-symbols-outlined">share</span>
                        <span class="fira-sans-condensed-black-italic">
                          Social Media Integration
                        </span>
                      </label>
                    </div>
                    <div class="column is-6">
                      <label class="checkbox automation-checkbox">
                        <input
                          type="checkbox"
                          v-model="projectForm.automation.copyTrading"
                        />
                        <span class="material-symbols-outlined">
                          currency_exchange
                        </span>
                        <span class="fira-sans-condensed-black-italic">
                          External Market Copy-Trading
                        </span>
                      </label>
                    </div>
                    <div class="column is-6">
                      <label class="checkbox automation-checkbox">
                        <input
                          type="checkbox"
                          v-model="projectForm.automation.riskManagement"
                        />
                        <span class="material-symbols-outlined">shield</span>
                        <span class="fira-sans-condensed-black-italic">
                          AI Risk Management
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                <hr class="mt-5 mb-5" /> -->

                <!-- Launch Button -->
                <div class="control mt-4 has-text-centered mt-5">
                  <button
                    class="button is-success is-large mt-5"
                    @click="launchProject()"
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
            <div
              class="model
               is-info p-6"
              style="margin-top: 1.25rem"
              v-if="
                purchasedProjects.length === 0 && deployedAgents.length === 0
              "
            >
              <span class="fira-sans-condensed-black-italic is-size-4">
                No Market or Agent available.
              </span>
              <div class="control has-text-center mt-5">
                <button
                  class="button chat is-success is-large"
                  @click.prevent="activeTab = 'buy'"
                >
                  <span class="material-symbols-outlined is-size-3 mr-2">
                    shopping_cart
                  </span>
                  Browse Marketplace
                </button>
              </div>
            </div>
            <!-- Active Projects -->
            <div
              v-if="purchasedProjects.length > 0"
              class="models__activity--payouts mb-5"
            >
              <h2
                class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left mb-4"
              >
                <span class="material-symbols-outlined mr-2">trending_up</span>
                Your Markets
              </h2>

              <div
                v-for="(project, idx) in purchasedProjects"
                :key="idx"
                class="market-access-card mb-4"
              >
                <div class="columns">
                  <div class="column is-8">
                    <h3
                      class="fira-sans-condensed-black-italic is-size-4 has-text-white"
                    >
                      <span class="material-symbols-outlined mr-2">
                        {{ project.icon }}
                      </span>
                      {{ project.name }}
                    </h3>
                    <div class="tags mt-2">
                      <span
                        class="tag is-warning fira-sans-condensed-black-italic"
                      >
                        {{ project.token }}
                      </span>
                      <span
                        class="tag is-info fira-sans-condensed-black-italic"
                      >
                        {{ project.markets }} Available SLAs
                      </span>
                      <span
                        class="tag is-success fira-sans-condensed-black-italic"
                      >
                        {{ project.yourPositions }} Active Positions
                      </span>
                    </div>
                  </div>
                  <div class="column is-4 has-text-right">
                    <button
                      class="button is-info is-large"
                      @click="viewMarkets(project)"
                    >
                      <span class="material-symbols-outlined mr-2">launch</span>
                      View Markets
                    </button>
                  </div>
                </div>
                <hr />
                <div class="columns">
                  <div class="column is-4 has-text-centered">
                    <p class="has-text-white is-size-7">Your P&L</p>
                    <p
                      class="fira-sans-condensed-black-italic is-size-4"
                      :class="
                        project.pnl >= 0
                          ? 'has-text-success'
                          : 'has-text-danger'
                      "
                    >
                      {{ project.pnl >= 0 ? "+" : "" }}{{ project.pnl }}%
                    </p>
                  </div>
                  <div class="column is-4 has-text-centered">
                    <p class="has-text-white is-size-7">Exposure</p>
                    <p
                      class="fira-sans-condensed-black-italic is-size-4 has-text-white"
                    >
                      {{ project.exposure }} {{ project.token }}
                    </p>
                  </div>
                  <div class="column is-4 has-text-centered">
                    <p class="has-text-white is-size-7">Pending Resolutions</p>
                    <p
                      class="fira-sans-condensed-black-italic is-size-4 has-text-white"
                    >
                      {{ project.pendingResolutions }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Deployed Agents -->
            <div
              v-if="deployedAgents.length > 0"
              class="models__activity--payouts"
            >
              <h2
                class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left mb-4"
              >
                <span class="material-symbols-outlined mr-2">psychology</span>
                Your Trading Agents
              </h2>

              <div
                v-for="(agent, idx) in deployedAgents"
                :key="idx"
                class="agent-status-card mb-4"
              >
                <div class="columns">
                  <div class="column is-8">
                    <h3
                      class="fira-sans-condensed-black-italic is-size-4 has-text-white"
                    >
                      <span class="material-symbols-outlined mr-2">
                        {{ agent.icon }}
                      </span>
                      {{ agent.name }}
                    </h3>
                    <div class="tags mt-2">
                      <span
                        class="tag fira-sans-condensed-black-italic"
                        :class="
                          agent.status === 'active'
                            ? 'is-success'
                            : 'is-warning'
                        "
                      >
                        {{ agent.status === "active" ? "Active" : "Paused" }}
                      </span>
                      <span
                        class="tag is-info fira-sans-condensed-black-italic"
                      >
                        {{ agent.tradesCount }} Trades
                      </span>
                    </div>
                  </div>
                  <div class="column is-4 has-text-right">
                    <button
                      class="button is-medium"
                      :class="
                        agent.status === 'active' ? 'is-warning' : 'is-success'
                      "
                      @click="toggleAgent(agent)"
                    >
                      <span class="material-symbols-outlined mr-2">
                        {{ agent.status === "active" ? "pause" : "play_arrow" }}
                      </span>
                      {{ agent.status === "active" ? "Pause" : "Resume" }}
                    </button>
                    <button
                      class="button is-info is-outlined is-medium ml-2"
                      @click="viewAgentDetails(agent)"
                    >
                      <span class="material-symbols-outlined mr-2">
                        analytics
                      </span>
                      Details
                    </button>
                    <!-- Run analysis button appears only for Copy Master agent -->
                    <button
                      v-if="agent.name === 'Copy Master'"
                      class="button is-success is-outlined is-medium ml-2"
                      @click="runAgentAnalysis(agent)"
                    >
                      <span class="material-symbols-outlined mr-2">
                        auto_read_play
                      </span>
                      Run Analysis
                    </button>
                  </div>
                </div>
                <hr />
                <div class="columns">
                  <div class="column is-3 has-text-centered">
                    <p class="has-text-white is-size-7">Return (7d)</p>
                    <p
                      class="fira-sans-condensed-black-italic is-size-4"
                      :class="
                        agent.return7d >= 0
                          ? 'has-text-success'
                          : 'has-text-danger'
                      "
                    >
                      {{ agent.return7d >= 0 ? "+" : "" }}{{ agent.return7d }}%
                    </p>
                  </div>
                  <div class="column is-3 has-text-centered">
                    <p class="has-text-white is-size-7">Win Rate</p>
                    <p
                      class="fira-sans-condensed-black-italic is-size-4 has-text-white"
                    >
                      {{ agent.winRate }}%
                    </p>
                  </div>
                  <div class="column is-3 has-text-centered">
                    <p class="has-text-white is-size-7">Avg Trade Size</p>
                    <p
                      class="fira-sans-condensed-black-italic is-size-4 has-text-white"
                    >
                      {{ agent.avgTradeSize }} BONZAI
                    </p>
                  </div>
                  <div class="column is-3 has-text-centered">
                    <p class="has-text-white is-size-7">Last Trade</p>
                    <p
                      class="fira-sans-condensed-black-italic is-size-4 has-text-white"
                    >
                      {{ agent.lastTrade }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- AI Generation Modal -->
    <div class="models__deployment-use" v-if="showAIModal">
      <div class="columns">
        <div class="column is-12 p-5">
          <div class="level">
            <div class="level-left">
              <div class="level-item"></div>
            </div>
            <div class="level-right">
              <div class="level-item">
                <button
                  class="button is-outlined is-info is-large fira-sans-condensed-black-italic ml-5"
                  @click="showAIModal = false"
                >
                  <span class="material-symbols-outlined is-size-1">close</span>
                </button>
              </div>
            </div>
          </div>
          <div class="notification is-info">
            <h1 class="fira-sans-condensed-black-italic has-text-centered">
              <span
                class="material-symbols-outlined"
                style="font-size: 92px !important"
              >
                neurology
              </span>
            </h1>
            <div class="has-text-centered mb-5">
              <span
                class="material-symbols-outlined rotating"
                style="font-size: 64px"
              >
                progress_activity
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted } from "vue";
import polymarketAgent from "./polymarketAgent.js";

/**
 * Helper to provide the current local language model definition. In a
 * production environment this could be replaced with a composable or
 * global store that reflects the user’s chosen model. For now it
 * returns the LLaMA 3.1 8B model details so that SmartAgent will use
 * this model when checking availability and sending prompts.
 */
function useCurrentModel() {
  return {
    modelname: "LLaMA 3.1 8B",
    modeldesc:
      "8B-parameter LLaMA 3.1 instruct model from Meta with a 131,072-token context window. Modern, strong general-purpose assistant with good multilingual and coding performance. Best for: main local chat and coding assistant on a single recent GPU.",
    url: "https://huggingface.co/lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    filename: "meta-llama-3.1-8b-instruct-q4_k_m.gguf",
    filesize: "4.92 GB",
    parameters: 8000000000,
    context: 131072,
  };
}

export default {
  name: "PredictionMarkets",
  setup() {
    const activeTab = ref("buy");
    const selectedProject = ref("polimarket");
    const selectedAgent = ref("copymaster");
    const showAIModal = ref(false);
    const aiModalMessage = ref("");

    const projectForm = reactive({
      name: "",
      tokenSymbol: "",
      description: "",
      totalSupply: "",
      initialLiquidity: "",
      accessPrice: "",
      marketIdeas: "",
      automation: {
        commentary: true,
        resolution: true,
        analytics: true,
        social: false,
        copyTrading: false,
        riskManagement: true,
      },
    });

    const purchasedProjects = ref([]);
    const deployedAgents = ref([]);

    // DSLA use cases represent the possible market themes for DSLA Protocol
    // markets. Each item has a key (used internally) and a user‑facing label.
    const dslaUseCases = [
      { key: "vol_returns", label: "Volatility of Returns" },
      { key: "vol_availability", label: "Volatility of Availability" },
      { key: "vol_asset_floors", label: "Volatility of Digital Asset Floors" },
      {
        key: "vol_currency_pegs",
        label: "Volatility of Digital Currency Pegs",
      },
      { key: "vol_response_time", label: "Volatility of Response Time" },
      { key: "vol_delivery_time", label: "Volatility of Delivery Time" },
    ];
    // The currently selected DSLA use case in the Sell tab. When a user clicks
    // one of the use case buttons, this ref will store the selected object.
    const selectedUseCase = ref(null);
    // A dynamic list of DSLA projects created via the Sell tab. When a user
    // launches a new prediction market project, it is added to this array so
    // it can appear in the Buy tab under “Your DSLA Projects”.
    const marketProjects = ref([]);

    // Model availability state. We use this to verify that the recommended
    // local language model is downloaded and loaded before attempting any
    // inference. When false, sendMessage will alert the user instead of
    // sending a prompt to the model.
    const modelLoaded = ref(false);
    // Retrieve the current model details. In this simple example this hook
    // returns the LLaMA 3.1 8B model definition. Should the user select a
    // different model in another part of the app, this hook can be
    // customised to return that model instead.
    const currentModel = useCurrentModel();

    /**
     * Check if the recommended model is available on disk via electronAPI.
     * Sets the modelLoaded ref accordingly. Returns true if available.
     */
    const isModelAvailable = async () => {
      if (window.electronAPI && window.electronAPI.checkModel) {
        try {
          const available = await window.electronAPI.checkModel(
            currentModel.filename
          );
          modelLoaded.value = !!available;
          return modelLoaded.value;
        } catch (e) {
          modelLoaded.value = false;
          return false;
        }
      }
      modelLoaded.value = false;
      return false;
    };

    /**
     * Send a prompt to the locally loaded language model. Before sending the
     * prompt, this helper ensures that the model file is downloaded and
     * available (via isModelAvailable). If available, it then calls
     * electronAPI.loadModel with the current model’s filename, parameters and
     * context to load it into memory. Finally it sends the prompt via
     * electronAPI.chat and returns the response. If the model is not
     * available or an error occurs, a message is shown and null is returned.
     *
     * @param {string} prompt The prompt to send to the model.
     * @returns {Promise<string|null>} The model's response or null on error.
     */
    const sendMessage = async (prompt) => {
      if (!prompt || typeof prompt !== "string") {
        return null;
      }
      // Check if the model file exists on disk. If not, alert the user.
      const available = await isModelAvailable();
      if (!available) {
        alert(
          `The selected model (${currentModel.modelname}) is not downloaded. Please download it via the model manager before using AI features.`
        );
        return null;
      }
      // Load the model into memory before sending the prompt.
      try {
        if (window.electronAPI && window.electronAPI.loadModel) {
          await window.electronAPI.loadModel({
            filename: currentModel.filename,
            parameters: currentModel.parameters,
            context: currentModel.context,
          });
          modelLoaded.value = true;
        }
      } catch (e) {
        console.error("Error loading model:", e);
      }
      try {
        if (window.electronAPI && window.electronAPI.chat) {
          const resp = await window.electronAPI.chat(prompt);
          console.log("Response:", resp);
          return resp;
        }
      } catch (e) {
        alert("An error occurred while communicating with the local model.");
      }
      return null;
    };

    // On mount, check if the recommended model is available. This allows
    // subsequent AI features to know whether they can send prompts.
    onMounted(async () => {
      await isModelAvailable();
    });

    const buyProjectAccess = (projectName) => {
      alert(
        `Purchasing access to ${projectName}...\n\nThis will allow you to trade in all ${projectName} prediction markets and deploy your agents there.`
      );
      // Built‑in DSLA projects with static data. Dynamic projects created in Sell tab are
      // stored in `marketProjects`. We merge both when purchasing access.
      const projectData = {
        PoliMarket: {
          name: "PoliMarket",
          token: "$POLI",
          icon: "how_to_vote",
          markets: 12,
          yourPositions: 0,
          pnl: 0,
          exposure: 0,
          pendingResolutions: 0,
        },
        CryptoOracle: {
          name: "CryptoOracle",
          token: "$CRYO",
          icon: "currency_bitcoin",
          markets: 8,
          yourPositions: 0,
          pnl: 0,
          exposure: 0,
          pendingResolutions: 0,
        },
        SportsBet: {
          name: "SportsBet",
          token: "$SPRT",
          icon: "sports_soccer",
          markets: 23,
          yourPositions: 0,
          pnl: 0,
          exposure: 0,
          pendingResolutions: 0,
        },
      };
      // If a dynamic DSLA project with this name exists, use it instead of the static mapping.
      const dynamic = marketProjects.value.find((p) => p.name === projectName);
      const dataToAdd = dynamic ? { ...dynamic } : projectData[projectName];
      if (!purchasedProjects.value.find((p) => p.name === projectName)) {
        purchasedProjects.value.push(dataToAdd);
      }
    };

    /**
     * Run the Polymarket copy‑trading analysis. This helper fetches
     * market data and top traders via the polymarketAgent, then uses
     * the locally loaded language model (electronAPI.chat) to
     * summarise each event. Results are shown in an alert.
     */
    const runCopyMasterAnalysis = async () => {
      aiModalMessage.value = "Analyzing top markets and traders...";
      showAIModal.value = true;
      try {
        const result = await polymarketAgent.execute(
          { numMarkets: 3, copyFraction: 0.1, llmEndpoint: "" },
          {}
        );
        const messages = [];
        if (result && Array.isArray(result.markets)) {
          for (const market of result.markets) {
            let summary = "";
            if (market.event && market.event.description) {
              // Only attempt summarisation if a model is loaded
              if (modelLoaded.value) {
                try {
                  const prompt = `Summarize the following prediction market description and highlight key factors that might influence the outcome:\n${market.event.description}`;
                  const resp = await sendMessage(prompt);
                  if (resp && typeof resp === "string") {
                    summary = resp.trim();
                  }
                } catch (_) {
                  // ignore summarisation errors
                }
              }
            }
            let recs = "";
            if (
              Array.isArray(market.recommendations) &&
              market.recommendations.length > 0
            ) {
              recs = market.recommendations
                .map(
                  (r) =>
                    `- ${r.trader} on “${r.outcome}” (whale size: ${Number(
                      r.originalSize
                    ).toFixed(2)}, your size: ${Number(r.suggestedSize).toFixed(
                      2
                    )})`
                )
                .join("\n");
            } else {
              recs = "No top traders identified.";
            }
            const desc =
              summary ||
              (market.event && market.event.description
                ? market.event.description.slice(0, 200)
                : "No description available.");
            messages.push(
              `Market: ${market.question}\n\nEvent analysis: ${desc}\n\nRecommended copy trades:\n${recs}`
            );
          }
        }
        alert(messages.join("\n\n---\n\n"));
      } catch (err) {
        alert(
          `An error occurred while analysing Polymarket markets: ${
            err && err.message ? err.message : err
          }`
        );
      } finally {
        showAIModal.value = false;
      }
    };

    const buyAgent = async (agentName) => {
      alert(
        `Deploying ${agentName}...\n\nThis agent will begin analysing markets and providing recommendations.`
      );
      // Only Copy Master is available. Define its default state.
      const copyMasterData = {
        name: "Copy Master",
        icon: "content_copy",
        status: "active",
        tradesCount: 0,
        return7d: 0,
        winRate: 0,
        avgTradeSize: 150,
        lastTrade: "Just deployed",
      };
      if (!deployedAgents.value.find((a) => a.name === agentName)) {
        deployedAgents.value.push(copyMasterData);
      }
      // Immediately run the Polymarket analysis when the Copy Master agent is deployed.
      if (agentName === "Copy Master") {
        await runCopyMasterAnalysis();
      }
    };

    /**
     * Generate content with the locally loaded LLM. This function uses
     * window.electronAPI.chat to call the selected local model. We select
     * LLaMA 3.1 8B Instruct as our default LLM because it offers a 128K
     * context window and strong reasoning capabilities【54352987922939†L42-L45】.
     * If the call fails or no model is loaded, we fall back to static
     * examples after a short delay.
     *
     * @param {string} type - one of 'description', 'tokenomics', 'markets'
     */
    const generateWithAI = async (type) => {
      const messages = {
        description: "Generating compelling project description...",
        tokenomics: "Calculating optimal token economics...",
        markets: "Generating trending prediction markets...",
      };
      aiModalMessage.value = messages[type];
      showAIModal.value = true;
      try {
        let prompt;
        if (type === "description") {
          const name = projectForm.name || "your prediction market project";
          prompt = `You are a sophisticated language model. Generate a concise, compelling description for a prediction market project called "${name}". Highlight AI-driven analysis, real-time sentiment tracking, automated resolution and token-based incentives.`;
          const resp = await sendMessage(prompt);
          if (typeof resp === "string" && resp.trim()) {
            projectForm.description = resp.trim();
            showAIModal.value = false;
            return;
          }
        } else if (type === "tokenomics") {
          prompt =
            "You are a token economics expert. Suggest total token supply, initial liquidity (in ETH) and access price (in BONZAI) for a new prediction market token. Return a JSON object with keys totalSupply, initialLiquidity, accessPrice.";
          const resp = await sendMessage(prompt);
          try {
            const data = resp ? JSON.parse(resp) : null;
            if (data && data.totalSupply !== undefined)
              projectForm.totalSupply = String(data.totalSupply);
            if (data && data.initialLiquidity !== undefined)
              projectForm.initialLiquidity = String(data.initialLiquidity);
            if (data && data.accessPrice !== undefined)
              projectForm.accessPrice = String(data.accessPrice);
            if (data) {
              showAIModal.value = false;
              return;
            }
          } catch (_) {
            // ignore JSON parse errors
          }
        } else if (type === "markets") {
          prompt =
            "Generate five trending prediction market questions across technology, finance and society. Provide each question on a new line.";
          const resp = await sendMessage(prompt);
          if (typeof resp === "string" && resp.trim()) {
            projectForm.marketIdeas = resp.trim();
            showAIModal.value = false;
            return;
          }
        }
      } catch (err) {
        // swallow errors and fall back
      }
      // fallback after a delay
      setTimeout(() => {
        if (type === "description" && !projectForm.description) {
          projectForm.description =
            "A revolutionary prediction market platform leveraging advanced AI for real-time market analysis, automated resolution, and intelligent trading strategies. Built on DSLA Protocol with BonzAI's cutting-edge automation pipeline.";
        } else if (type === "tokenomics") {
          projectForm.totalSupply = "1000000000";
          projectForm.initialLiquidity = "25";
          projectForm.accessPrice = "10000";
        } else if (type === "markets" && !projectForm.marketIdeas) {
          projectForm.marketIdeas = `Will AI achieve AGI by 2030?\nWill Bitcoin reach $150k in 2025?\nWill fusion energy be commercialized by 2028?\nWill quantum computing break RSA by 2027?\nWill autonomous vehicles dominate by 2029?`;
        }
        showAIModal.value = false;
      }, 2500);
    };

    const launchProject = () => {
      if (!projectForm.name || !projectForm.tokenSymbol) {
        alert("Please fill in required fields: Project Name and Token Symbol");
        return;
      }
      aiModalMessage.value = `Deploying ${projectForm.name} to blockchain...`;
      showAIModal.value = true;
      setTimeout(() => {
        showAIModal.value = false;
        alert(
          `🚀 ${projectForm.name} launched successfully!\n\nYour prediction market project is now live with the ${projectForm.tokenSymbol} token.`
        );
        // Compute the number of markets from the marketIdeas field
        const marketsCount = projectForm.marketIdeas
          ? projectForm.marketIdeas
              .split("\n")
              .map((l) => l.trim())
              .filter((l) => l.length > 0).length
          : 0;
        // Add the new project to the list of DSLA market projects so it appears in the Buy tab
        marketProjects.value.push({
          name: projectForm.name,
          token: `$${projectForm.tokenSymbol.toUpperCase()}`,
          icon: "query_stats",
          markets: marketsCount,
          yourPositions: 0,
          pnl: 0,
          exposure: 0,
          pendingResolutions: 0,
          description: projectForm.description,
          useCase: selectedUseCase.value ? selectedUseCase.value.label : null,
          accessPrice: projectForm.accessPrice,
        });
        // Reset form except automation settings
        Object.keys(projectForm).forEach((key) => {
          if (key !== "automation") {
            projectForm[key] = "";
          }
        });
        // Reset selected use case
        selectedUseCase.value = null;
      }, 3000);
    };

    const viewMarkets = (project) => {
      alert(
        `Opening ${project.name} markets...\n\nYou have access to ${project.markets} active SLAs. You can place predictions, view odds, and monitor resolutions.`
      );
    };

    const toggleAgent = (agent) => {
      agent.status = agent.status === "active" ? "paused" : "active";
    };

    const viewAgentDetails = (agent) => {
      alert(
        `${agent.name} Details\n\nStatus: ${agent.status}\nTrades: ${agent.tradesCount}\n7d Return: ${agent.return7d}%\nWin Rate: ${agent.winRate}%`
      );
    };

    /**
     * Select a DSLA use case. This sets the currently selected use case for the Sell tab.
     * @param {Object} useCase
     */
    const selectUseCase = (useCase) => {
      selectedUseCase.value = useCase;
    };

    /**
     * Populate the Sell tab form fields based on the chosen DSLA use case. This function uses
     * the local LLM via window.electronAPI.chat to generate a JSON template containing all
     * required fields: name, tokenSymbol, description, totalSupply, initialLiquidity,
     * accessPrice and marketIdeas. If the call fails or returns invalid JSON, fallback
     * static examples are used.
     */
    const populateDSLAFields = async () => {
      if (!selectedUseCase.value) {
        alert("Please select a DSLA use case to populate.");
        return;
      }
      aiModalMessage.value = `Generating ${selectedUseCase.value.label} market template...`;
      showAIModal.value = true;
      try {
        const prompt =
          `You are helping to create a DSLA prediction market for the use case "${selectedUseCase.value.label}". ` +
          `Propose a project name (a single word or short phrase), a 3‑4 letter token symbol, ` +
          `a brief but compelling project description explaining how the market addresses ${selectedUseCase.value.label.toLowerCase()}, ` +
          `total token supply, initial liquidity in ETH, access price in BONZAI, ` +
          `and five market questions relevant to this theme. ` +
          `Return your response as a JSON object with fields: name (string), tokenSymbol (string), ` +
          `description (string), totalSupply (number), initialLiquidity (number), accessPrice (number), marketIdeas (string with questions separated by newline).` +
          `Only return a JSON object, nothing else.`;
        const resp = await sendMessage(prompt);
        try {
          const data = resp ? JSON.parse(resp) : null;
          if (data) {
            projectForm.name = data.name || projectForm.name;
            projectForm.tokenSymbol =
              data.tokenSymbol || projectForm.tokenSymbol;
            projectForm.description =
              data.description || projectForm.description;
            if (data.totalSupply !== undefined)
              projectForm.totalSupply = String(data.totalSupply);
            if (data.initialLiquidity !== undefined)
              projectForm.initialLiquidity = String(data.initialLiquidity);
            if (data.accessPrice !== undefined)
              projectForm.accessPrice = String(data.accessPrice);
            if (data.marketIdeas) projectForm.marketIdeas = data.marketIdeas;
            showAIModal.value = false;
            return;
          }
        } catch (e) {
          // ignore JSON parsing errors
        }
      } catch (_) {
        // ignore errors
      }
      // fallback static template for each DSLA use case
      const fallback = {
        vol_returns: {
          name: "ReturnGuard",
          tokenSymbol: "RET",
          description:
            "A DSLA market measuring volatility in user returns across DeFi pools. Traders can hedge against unpredictable yield performance.",
          totalSupply: "1000000000",
          initialLiquidity: "20",
          accessPrice: "5000",
          marketIdeas: `Will the average DeFi yield stay above 5% for the next 30 days?\nWill protocol X’s APY exceed 10% this month?\nWill the staking returns for token Y drop below 3% next quarter?\nWill the annualised return of major DeFi pools exceed 8% this year?\nWill the yield on stablecoin lending be above 4% at year end?`,
        },
        vol_availability: {
          name: "UptimeWatch",
          tokenSymbol: "UPT",
          description:
            "Track and trade on service availability fluctuations. This market focuses on downtime events across critical decentralised services.",
          totalSupply: "500000000",
          initialLiquidity: "15",
          accessPrice: "4000",
          marketIdeas: `Will chain Z experience more than 1 hour of downtime this month?\nWill major protocol A have an outage longer than 30 minutes this quarter?\nWill cloud provider B deliver 99.9% uptime next year?\nWill DeFi platform C remain fully available during the next network upgrade?\nWill any top 10 dApp have significant downtime this week?`,
        },
        vol_asset_floors: {
          name: "FloorGuard",
          tokenSymbol: "FLR",
          description:
            "A market observing volatility in the floor prices of popular NFT and token collections. Participants can hedge or speculate on price stability.",
          totalSupply: "800000000",
          initialLiquidity: "10",
          accessPrice: "6000",
          marketIdeas: `Will the floor price of collection D drop below 50 ETH this month?\nWill project E’s floor price increase by more than 20% this quarter?\nWill any blue‑chip NFT have a new all‑time low within 60 days?\nWill the average floor price of the top 5 collections rise next month?\nWill token F’s price floor stay above 1 USDC this season?`,
        },
        vol_currency_pegs: {
          name: "PegShield",
          tokenSymbol: "PEG",
          description:
            "Monitor the stability of digital currency pegs. This market lets traders insure against depeg events and speculate on currency stability.",
          totalSupply: "1200000000",
          initialLiquidity: "30",
          accessPrice: "7000",
          marketIdeas: `Will stablecoin G trade below $0.98 at any point this week?\nWill currency H maintain its peg for the next 90 days?\nWill any major stablecoin lose more than 5% of its peg this year?\nWill new algorithmic stablecoin I remain within 1% of its peg after launch?\nWill stablecoin J depeg above $1.02 in the next 6 months?`,
        },
        vol_response_time: {
          name: "LatencyLab",
          tokenSymbol: "LAT",
          description:
            "Trade on network response time fluctuations. This market covers delays in transaction confirmations and API responses across blockchains.",
          totalSupply: "900000000",
          initialLiquidity: "18",
          accessPrice: "5500",
          marketIdeas: `Will average block time on chain K exceed 15 seconds this month?\nWill transaction confirmation times on network L improve by 20% this quarter?\nWill there be a significant API slowdown for service M this week?\nWill cross‑chain bridge N suffer latency above 30 seconds this year?\nWill any Layer 2 solution achieve sub‑5 second confirmations next quarter?`,
        },
        vol_delivery_time: {
          name: "DeliveryDex",
          tokenSymbol: "DLV",
          description:
            "Predict volatility in digital goods delivery times. Focuses on NFT minting, token claims and airdrops settlement delays.",
          totalSupply: "750000000",
          initialLiquidity: "12",
          accessPrice: "4500",
          marketIdeas: `Will NFT drop O complete distribution within 24 hours?\nWill token claim P take longer than 3 days to finalise?\nWill airdrop Q experience delays exceeding 48 hours?\nWill any major NFT mint finish under one hour next month?\nWill staking rewards from protocol R be delivered late this season?`,
        },
      };
      const key = selectedUseCase.value.key;
      if (fallback[key]) {
        const data = fallback[key];
        projectForm.name = data.name;
        projectForm.tokenSymbol = data.tokenSymbol;
        projectForm.description = data.description;
        projectForm.totalSupply = data.totalSupply;
        projectForm.initialLiquidity = data.initialLiquidity;
        projectForm.accessPrice = data.accessPrice;
        projectForm.marketIdeas = data.marketIdeas;
      }
      showAIModal.value = false;
    };

    /**
     * Run analysis for a deployed agent. Currently only Copy Master supports analysis.
     */
    const runAgentAnalysis = async (agent) => {
      if (agent.name === "Copy Master") {
        await runCopyMasterAnalysis();
      } else {
        alert("Analysis not available for this agent.");
      }
    };

    return {
      activeTab,
      selectedProject,
      selectedAgent,
      showAIModal,
      aiModalMessage,
      projectForm,
      purchasedProjects,
      deployedAgents,
      buyProjectAccess,
      buyAgent,
      generateWithAI,
      launchProject,
      viewMarkets,
      toggleAgent,
      viewAgentDetails,
      runCopyMasterAnalysis,
      // DSLA-related state and helpers
      dslaUseCases,
      selectedUseCase,
      marketProjects,
      selectUseCase,
      populateDSLAFields,
      runAgentAnalysis,
      isModelAvailable,
      sendMessage,
      modelLoaded,
    };
  },
};
</script>

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

/* Commented gradient background for reference
.background {
  position: absolute;
  z-index: -1;
  height: 100%;
  width: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  filter: blur(6px);
  animation: gradient 15s ease infinite;
  background-size: 400% 400%;
}*/

.background {
  position: absolute;
  z-index: -1;
  height: 100%;
  width: 100%;
  background: url("src/assets/bonzai_agent.jpg") no-repeat;
  background-size: cover;
  filter: blur(6px);
  animation: move 40s ease infinite;
  overflow: hidden;
}

@keyframes gradient {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.rotating {
  animation: rotate 2s linear infinite;
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
  position: relative;
  background: transparent;
  padding: 0 !important;
  margin: 0 !important;
}

.models__deployment-install {
  overflow-y: auto;
  padding: 6em;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
}

.models__activity--payouts {
  padding: 4em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
  border-radius: 4px !important;
}

.tabs li {
  color: rgba(255, 255, 255, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
}

.tabs li a {
  color: rgba(255, 255, 255, 0.3);
}

.tabs a:hover {
  color: rgba(255, 255, 255, 1) !important;
  border-color: rgba(255, 255, 255, 1) !important;
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

input[type="radio"] {
  display: none;
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

.tags {
  position: absolute;
  top: -16px;
  right: -16px;
  text-shadow: none;
}

.automation-checkbox {
  display: flex;
  align-items: center;
  padding: 1em;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: all 0.2s ease;
  color: white;
}

.automation-checkbox:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 224, 138, 0.5);
}

.automation-checkbox input[type="checkbox"] {
  margin-right: 1em;
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.automation-checkbox .material-symbols-outlined {
  margin-right: 0.5em;
  color: #ffe08a;
}

.market-access-card,
.agent-status-card {
  padding: 2em;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(16px);
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

ul,
ol {
  padding: 0;
  list-style-type: none;
}

/* Highlight selected DSLA use case button */
.button.is-selected {
  background: rgba(97, 55, 142, 0.33) !important;
  border-color: rgba(255, 255, 255, 1) !important;
  color: #ffffff !important;
}

.bonzai__agent-description .notification.is-success {
  background-color: rgba(72, 199, 142, 0.25) !important;
  border: 1px solid rgba(72, 199, 142, 0.9);
  color: #fff;
}

.bonzai__agent-description .notification p {
  font-weight: 300;
}
</style>
