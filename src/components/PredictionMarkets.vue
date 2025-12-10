<template scoped>
  <div class="background"></div>
  <div class="models__deployment column is-8 is-paddingless">
    <div class="models__deployment-install">
      <div class="columns">
        <div class="column is-12 p-5">
          <!-- Header -->
          <div class="level mb-5">
            <div class="level-left">
              <h1
                class="fira-sans-condensed-black-italic is-size-1 has-text-white"
              >
                <span
                  class="material-symbols-outlined mr-2"
                  style="font-size: 64px"
                >
                  query_stats
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
            <div class="models__activity--payouts">
              <!-- Featured Project Example: PoliMarket -->
              <div class="columns">
                <div class="column is-12">
                  <div
                    class="columns is-8 is-multiline control mb-5 has-text-left"
                  >
                    <div class="bonzai__agent column is-4">
                      <input
                        v-model="selectedProject"
                        value="polimarket"
                        id="project_polimarket"
                        type="radio"
                        name="project"
                        checked
                      />
                      <label for="project_polimarket" class="radio">
                        <span
                          class="material-symbols-outlined"
                          style="font-size: 32px !important"
                        >
                          how_to_vote
                        </span>
                        PoliMarket
                        <div class="tags has-addons">
                          <span
                            class="tag partner fira-sans-condensed-black-italic"
                          >
                            $POLI
                          </span>
                          <span
                            class="tag is-success partner fira-sans-condensed-black-italic"
                          >
                            12 Markets
                          </span>
                        </div>
                      </label>
                    </div>
                    <div class="bonzai__agent column is-8">
                      <div class="control has-text-right">
                        <button
                          class="button chat is-success is-medium"
                          @click="buyProjectAccess('PoliMarket')"
                        >
                          <span
                            class="material-symbols-outlined is-size-3 mr-2"
                          >
                            shopping_cart
                          </span>
                          Buy Access
                          <div class="tags has-addons">
                            <span
                              class="tag is-warning partner fira-sans-condensed-black-italic"
                            >
                              10K BONZAI
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
                            About.
                          </span>
                          Political event prediction markets powered by AI
                          analysis and real-time sentiment tracking.
                        </p>
                      </li>
                      <li>
                        <p>
                          <span class="fira-sans-condensed-black-italic mr-2">
                            TVL.
                          </span>
                          $2.4M locked across 12 active SLAs
                        </p>
                      </li>
                      <li>
                        <p>
                          <span class="fira-sans-condensed-black-italic mr-2">
                            Features.
                          </span>
                          AI commentary, automated oracle resolution, social
                          sentiment integration
                        </p>
                      </li>
                      <li>
                        <p>
                          <span class="fira-sans-condensed-black-italic mr-2">
                            Resolution.
                          </span>
                          DSLA Protocol smart contracts with multi-source oracle
                          verification
                        </p>
                      </li>
                    </ol>
                    <hr />
                    <h2 class="fira-sans-condensed-black-italic mr-2 is-size-4">
                      Powered by
                    </h2>
                    <img
                      src="https://cdn.prod.website-files.com/60118ca18674407b85935203/64f6f41dcae1161d9e6a7b43_White.svg"
                      style="max-width: 200px"
                      alt="DSLA Protocol"
                    />
                  </div>

                  <!-- More Projects -->
                  <hr />
                  <div class="bonzai__agent column is-4">
                    <input
                      v-model="selectedProject"
                      value="cryptooracle"
                      id="project_cryptooracle"
                      type="radio"
                      name="project"
                    />
                    <label for="project_cryptooracle" class="radio">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        currency_bitcoin
                      </span>
                      CryptoOracle
                      <div class="tags has-addons">
                        <span
                          class="tag partner fira-sans-condensed-black-italic"
                        >
                          $CRYO
                        </span>
                        <span
                          class="tag is-success partner fira-sans-condensed-black-italic"
                        >
                          8 Markets
                        </span>
                      </div>
                    </label>
                  </div>
                  <div class="bonzai__agent column is-8">
                    <div class="control has-text-right">
                      <button
                        class="button chat is-success is-medium"
                        @click="buyProjectAccess('CryptoOracle')"
                      >
                        <span class="material-symbols-outlined is-size-3 mr-2">
                          shopping_cart
                        </span>
                        Buy Access
                        <div class="tags has-addons">
                          <span
                            class="tag is-warning partner fira-sans-condensed-black-italic"
                          >
                            8K BONZAI
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                  <hr />

                  <div class="bonzai__agent column is-4">
                    <input
                      v-model="selectedProject"
                      value="sportsbet"
                      id="project_sportsbet"
                      type="radio"
                      name="project"
                    />
                    <label for="project_sportsbet" class="radio">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        sports_soccer
                      </span>
                      SportsBet
                      <div class="tags has-addons">
                        <span
                          class="tag partner fira-sans-condensed-black-italic"
                        >
                          $SPRT
                        </span>
                        <span
                          class="tag is-success partner fira-sans-condensed-black-italic"
                        >
                          23 Markets
                        </span>
                      </div>
                    </label>
                  </div>
                  <div class="bonzai__agent column is-8">
                    <div class="control has-text-right">
                      <button
                        class="button chat is-success is-medium"
                        @click="buyProjectAccess('SportsBet')"
                      >
                        <span class="material-symbols-outlined is-size-3 mr-2">
                          shopping_cart
                        </span>
                        Buy Access
                        <div class="tags has-addons">
                          <span
                            class="tag is-warning partner fira-sans-condensed-black-italic"
                          >
                            12K BONZAI
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Smart Trading Agents Section -->
              <hr class="mt-6 mb-6" />
              <h2
                class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left mb-5"
              >
                <span class="material-symbols-outlined mr-2">psychology</span>
                Smart Trading Agents
              </h2>

              <div class="columns">
                <div class="column is-12">
                  <div
                    class="columns is-8 is-multiline control mb-5 has-text-left"
                  >
                    <!-- Momentum Trader -->
                    <div class="bonzai__agent column is-4">
                      <input
                        v-model="selectedAgent"
                        value="momentum"
                        id="agent_momentum"
                        type="radio"
                        name="agent"
                      />
                      <label for="agent_momentum" class="radio">
                        <span
                          class="material-symbols-outlined"
                          style="font-size: 32px !important"
                        >
                          trending_up
                        </span>
                        Momentum Trader
                        <div class="tags has-addons">
                          <span
                            class="tag is-success partner fira-sans-condensed-black-italic"
                          >
                            +18.4% (30d)
                          </span>
                          <span
                            class="tag is-info partner fira-sans-condensed-black-italic"
                          >
                            67% Win
                          </span>
                        </div>
                      </label>
                    </div>
                    <div class="bonzai__agent column is-8">
                      <div class="control has-text-right">
                        <button
                          class="button chat is-success is-medium"
                          @click="buyAgent('Momentum Trader')"
                        >
                          <span
                            class="material-symbols-outlined is-size-3 mr-2"
                          >
                            shopping_cart
                          </span>
                          Buy Agent
                          <div class="tags has-addons">
                            <span
                              class="tag is-warning partner fira-sans-condensed-black-italic"
                            >
                              5K BONZAI
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
                            Strategy.
                          </span>
                          Identifies rapid probability shifts and executes
                          trades to capture momentum before market correction.
                        </p>
                      </li>
                      <li>
                        <p>
                          <span class="fira-sans-condensed-black-italic mr-2">
                            Markets.
                          </span>
                          Works across all prediction markets you have access to
                        </p>
                      </li>
                      <li>
                        <p>
                          <span class="fira-sans-condensed-black-italic mr-2">
                            Performance.
                          </span>
                          142 trades executed, 67% win rate, +18.4% return (30
                          days)
                        </p>
                      </li>
                    </ol>

                    <hr />

                    <!-- Copy Master -->
                    <div class="bonzai__agent column is-4">
                      <input
                        v-model="selectedAgent"
                        value="copymaster"
                        id="agent_copymaster"
                        type="radio"
                        name="agent"
                      />
                      <label for="agent_copymaster" class="radio">
                        <span
                          class="material-symbols-outlined"
                          style="font-size: 32px !important"
                        >
                          content_copy
                        </span>
                        Copy Master
                        <div class="tags has-addons">
                          <span
                            class="tag is-success partner fira-sans-condensed-black-italic"
                          >
                            +24.7% (30d)
                          </span>
                          <span
                            class="tag is-info partner fira-sans-condensed-black-italic"
                          >
                            72% Win
                          </span>
                        </div>
                      </label>
                    </div>
                    <div class="bonzai__agent column is-8">
                      <div class="control has-text-right">
                        <button
                          class="button chat is-success is-medium"
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
                              class="tag is-warning partner fira-sans-condensed-black-italic"
                            >
                              8K BONZAI
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
                            Strategy.
                          </span>
                          Mirrors top-performing traders on Polymarket and
                          Kalshi, executing identical positions in real-time.
                        </p>
                      </li>
                      <li>
                        <p>
                          <span class="fira-sans-condensed-black-italic mr-2">
                            External Markets.
                          </span>
                          Polymarket, Kalshi copy-trading enabled
                        </p>
                      </li>
                      <li>
                        <p>
                          <span class="fira-sans-condensed-black-italic mr-2">
                            Performance.
                          </span>
                          89 trades executed, 72% win rate, +24.7% return (30
                          days)
                        </p>
                      </li>
                    </ol>

                    <hr />

                    <!-- Arbitrage Hunter -->
                    <div class="bonzai__agent column is-4">
                      <input
                        v-model="selectedAgent"
                        value="arbitrage"
                        id="agent_arbitrage"
                        type="radio"
                        name="agent"
                      />
                      <label for="agent_arbitrage" class="radio">
                        <span
                          class="material-symbols-outlined"
                          style="font-size: 32px !important"
                        >
                          compare_arrows
                        </span>
                        Arbitrage Hunter
                        <div class="tags has-addons">
                          <span
                            class="tag is-success partner fira-sans-condensed-black-italic"
                          >
                            +12.1% (30d)
                          </span>
                          <span
                            class="tag is-info partner fira-sans-condensed-black-italic"
                          >
                            94% Win
                          </span>
                        </div>
                      </label>
                    </div>
                    <div class="bonzai__agent column is-8">
                      <div class="control has-text-right">
                        <button
                          class="button chat is-success is-medium"
                          @click="buyAgent('Arbitrage Hunter')"
                        >
                          <span
                            class="material-symbols-outlined is-size-3 mr-2"
                          >
                            shopping_cart
                          </span>
                          Buy Agent
                          <div class="tags has-addons">
                            <span
                              class="tag is-warning partner fira-sans-condensed-black-italic"
                            >
                              10K BONZAI
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
                            Strategy.
                          </span>
                          Detects price discrepancies across multiple prediction
                          markets and executes risk-free arbitrage trades.
                        </p>
                      </li>
                      <li>
                        <p>
                          <span class="fira-sans-condensed-black-italic mr-2">
                            Risk Profile.
                          </span>
                          Low risk, high win rate, consistent returns
                        </p>
                      </li>
                      <li>
                        <p>
                          <span class="fira-sans-condensed-black-italic mr-2">
                            Performance.
                          </span>
                          267 trades executed, 94% win rate, +12.1% return (30
                          days)
                        </p>
                      </li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- SELL TAB -->
          <div v-if="activeTab === 'sell'">
            <div class="models__activity--payouts">
              <div class="bonzai__agent">
                <!-- Project Identity -->
                <h2
                  class="fira-sans-condensed-black-italic is-size-4 has-text-white has-text-left mb-4"
                >
                  <span class="material-symbols-outlined mr-2">
                    deployed_code
                  </span>
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
                <div class="control has-text-right mb-5">
                  <button
                    class="button is-info is-medium"
                    @click="generateWithAI('description')"
                  >
                    <span class="material-symbols-outlined mr-2">
                      psychology
                    </span>
                    Generate with AI
                  </button>
                </div>

                <hr />

                <!-- Token Economics -->
                <h2
                  class="fira-sans-condensed-black-italic is-size-4 has-text-white has-text-left mb-4 mt-5"
                >
                  <span class="material-symbols-outlined mr-2">toll</span>
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
                <div class="control has-text-right mb-5">
                  <button
                    class="button is-info is-medium"
                    @click="generateWithAI('tokenomics')"
                  >
                    <span class="material-symbols-outlined mr-2">
                      calculate
                    </span>
                    AI Tokenomics Advisor
                  </button>
                </div>

                <hr />

                <!-- Initial Markets/SLAs -->
                <h2
                  class="fira-sans-condensed-black-italic is-size-4 has-text-white has-text-left mb-4 mt-5"
                >
                  <span class="material-symbols-outlined mr-2">
                    data_exploration
                  </span>
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
                      placeholder="Will Bitcoin reach $100k by end of 2025?
Will AI generate 50% of code by 2026?
Will fusion power be commercially viable by 2030?"
                    ></textarea>
                  </div>
                </div>
                <div class="control has-text-right mb-5">
                  <button
                    class="button is-info is-medium"
                    @click="generateWithAI('markets')"
                  >
                    <span class="material-symbols-outlined mr-2">
                      auto_awesome
                    </span>
                    AI Market Generator
                  </button>
                </div>

                <hr />

                <!-- Automation Pipeline -->
                <div class="models__activity--payouts has-text-right p-5 mt-5">
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

                <hr class="mt-5 mb-5" />

                <!-- Launch Button -->
                <div class="control mt-4 has-text-right">
                  <button
                    class="button is-success is-large"
                    @click="launchProject()"
                  >
                    <span class="material-symbols-outlined mr-2">
                      rocket_launch
                    </span>
                    List Prediction Market Project
                    <div class="tags has-addons">
                      <span
                        class="tag is-warning partner fira-sans-condensed-black-italic"
                      >
                        100K BONZAI
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
              v-if="
                purchasedProjects.length === 0 && deployedAgents.length === 0
              "
              class="models__activity--payouts"
            >
              <div class="has-text-centered">
                <span
                  class="material-symbols-outlined"
                  style="font-size: 128px; color: rgba(255, 255, 255, 0.3)"
                >
                  query_stats
                </span>
                <h3
                  class="fira-sans-condensed-black-italic is-size-3 has-text-white mt-3"
                >
                  No Active Positions
                </h3>
                <p class="has-text-white is-size-5 mb-4">
                  Buy access to prediction markets or deploy trading agents to
                  get started
                </p>
                <button
                  class="button is-success is-large"
                  @click="activeTab = 'buy'"
                >
                  <span class="material-symbols-outlined mr-2">
                    shopping_cart
                  </span>
                  Browse Markets
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
              <div class="level-item">
                <h1 class="fira-sans-condensed-black-italic">
                  <span
                    class="material-symbols-outlined mr-2"
                    style="font-size: 92px !important"
                  >
                    psychology
                  </span>
                  BonzAI Processing
                </h1>
              </div>
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

          <div class="models__activity--payouts">
            <div class="has-text-centered mb-5">
              <span
                class="material-symbols-outlined rotating"
                style="font-size: 64px; color: #ffe08a"
              >
                progress_activity
              </span>
              <h3
                class="fira-sans-condensed-black-italic is-size-4 has-text-white mt-3"
              >
                {{ aiModalMessage }}
              </h3>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive } from "vue";

export default {
  name: "PredictionMarkets",
  setup() {
    const activeTab = ref("buy");
    const selectedProject = ref("polimarket");
    const selectedAgent = ref("momentum");
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

    const purchasedProjects = ref([
      // Example data - will be populated when user buys access
    ]);

    const deployedAgents = ref([
      // Example data - will be populated when user deploys agents
    ]);

    const buyProjectAccess = (projectName) => {
      alert(
        `Purchasing access to ${projectName}...\n\nThis will allow you to trade in all ${projectName} prediction markets and deploy your agents there.`
      );

      // Simulate adding to purchased projects
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

      if (!purchasedProjects.value.find((p) => p.name === projectName)) {
        purchasedProjects.value.push(projectData[projectName]);
      }
    };

    const buyAgent = (agentName) => {
      alert(
        `Deploying ${agentName}...\n\nThis agent will begin trading automatically across all markets you have access to.`
      );

      // Simulate adding to deployed agents
      const agentData = {
        "Momentum Trader": {
          name: "Momentum Trader",
          icon: "trending_up",
          status: "active",
          tradesCount: 0,
          return7d: 0,
          winRate: 0,
          avgTradeSize: 100,
          lastTrade: "Just deployed",
        },
        "Copy Master": {
          name: "Copy Master",
          icon: "content_copy",
          status: "active",
          tradesCount: 0,
          return7d: 0,
          winRate: 0,
          avgTradeSize: 150,
          lastTrade: "Just deployed",
        },
        "Arbitrage Hunter": {
          name: "Arbitrage Hunter",
          icon: "compare_arrows",
          status: "active",
          tradesCount: 0,
          return7d: 0,
          winRate: 0,
          avgTradeSize: 200,
          lastTrade: "Just deployed",
        },
      };

      if (!deployedAgents.value.find((a) => a.name === agentName)) {
        deployedAgents.value.push(agentData[agentName]);
      }
    };

    const generateWithAI = (type) => {
      const messages = {
        description: "Generating compelling project description...",
        tokenomics: "Calculating optimal token economics...",
        markets: "Generating trending prediction markets...",
      };

      aiModalMessage.value = messages[type];
      showAIModal.value = true;

      setTimeout(() => {
        showAIModal.value = false;

        if (type === "description" && !projectForm.description) {
          projectForm.description =
            "A revolutionary prediction market platform leveraging advanced AI for real-time market analysis, automated resolution, and intelligent trading strategies. Built on DSLA Protocol with BonzAI's cutting-edge automation pipeline.";
        } else if (type === "tokenomics") {
          projectForm.totalSupply = "1000000000";
          projectForm.initialLiquidity = "25";
          projectForm.accessPrice = "10000";
        } else if (type === "markets" && !projectForm.marketIdeas) {
          projectForm.marketIdeas = `Will AI achieve AGI by 2030?
Will Bitcoin reach $150k in 2025?
Will fusion energy be commercialized by 2028?
Will quantum computing break RSA by 2027?
Will autonomous vehicles dominate by 2029?`;
        }
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

        // Reset form
        Object.keys(projectForm).forEach((key) => {
          if (key !== "automation") {
            projectForm[key] = "";
          }
        });
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

.background {
  position: absolute;
  z-index: -1;
  height: 100%;
  width: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  filter: blur(6px);
  animation: gradient 15s ease infinite;
  background-size: 400% 400%;
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
  top: -15px;
  right: -8px;
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
</style>
