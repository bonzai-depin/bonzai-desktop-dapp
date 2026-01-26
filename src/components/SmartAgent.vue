<template scoped>
  <div class="background"></div>

  <!-- Status Notification Toast -->
  <Transition name="notification-slide">
    <div
      v-if="statusNotification.show"
      class="status-notification fira-sans-condensed-black-italic"
      :class="'is-' + statusNotification.type"
    >
      <span class="material-symbols-outlined mr-2">
        {{
          statusNotification.type === "success"
            ? "check_circle"
            : statusNotification.type === "danger"
              ? "error"
              : statusNotification.type === "warning"
                ? "warning"
                : "info"
        }}
      </span>
      {{ statusNotification.message }}
    </div>
  </Transition>

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
                  hub
                </span>
                Skills Marketplace
              </h1>
            </div>
            <div class="level-right">
              <button
                class="button is-info is-large is-outlined fira-sans-condensed-black-italic"
                @click="refreshSkills"
              >
                <span class="material-symbols-outlined mr-2">refresh</span>
                Refresh
              </button>
            </div>
          </div>

          <!-- Tabs -->
          <div class="tabs is-large is-fullwidth mb-5">
            <ul>
              <li :class="{ 'is-active': activeTab === 'browse' }">
                <a
                  @click.prevent="activeTab = 'browse'"
                  class="fira-sans-condensed-black-italic is-size-1"
                >
                  <span class="material-symbols-outlined mr-2 is-size-1">
                    shopping_cart
                  </span>
                  Browse
                </a>
              </li>
              <li :class="{ 'is-active': activeTab === 'my-skills' }">
                <a
                  @click.prevent="activeTab = 'my-skills'"
                  class="fira-sans-condensed-black-italic is-size-1"
                >
                  <span class="material-symbols-outlined mr-2 is-size-1">
                    inventory_2
                  </span>
                  My Skills
                </a>
              </li>
              <li :class="{ 'is-active': activeTab === 'create' }">
                <a
                  @click.prevent="activeTab = 'create'"
                  class="fira-sans-condensed-black-italic is-size-1"
                >
                  <span class="material-symbols-outlined mr-2 is-size-1">
                    add_circle
                  </span>
                  Create
                </a>
              </li>
            </ul>
          </div>

          <!-- BROWSE TAB -->
          <div v-if="activeTab === 'browse'">
            <!-- Category Filter -->
            <div class="category-filter mb-5">
              <div class="control category-selector">
                <button
                  class="button category-btn"
                  :class="{ 'is-active': !selectedCategory }"
                  @click="setCategory(null)"
                >
                  <span class="material-symbols-outlined mr-1">apps</span>
                  All
                </button>
                <button
                  v-for="cat in categories"
                  :key="cat.key"
                  class="button category-btn"
                  :class="{ 'is-active': selectedCategory === cat.key }"
                  @click="setCategory(cat.key)"
                >
                  <span class="material-symbols-outlined mr-1">{{ cat.icon }}</span>
                  {{ cat.label }}
                </button>
              </div>
            </div>

            <!-- Search -->
            <div class="field has-addons mb-5">
              <div class="control is-expanded">
                <input
                  class="input is-large no-shadow"
                  type="text"
                  v-model="searchQuery"
                  placeholder="Search skills by name, description, or tags..."
                />
              </div>
              <div class="control">
                <button class="button is-info is-large no-shadow">
                  <span class="material-symbols-outlined">search</span>
                </button>
              </div>
            </div>

            <!-- Skills Grid -->
            <div v-if="filteredSkills.length > 0" class="skills-grid">
              <div
                v-for="skill in filteredSkills"
                :key="skill.id"
                class="skill-card models__activity--payouts"
                :class="{ 'is-owned': canRunSkill(skill.id).canRun }"
              >
                <div class="skill-header">
                  <h3 class="skill-name fira-sans-condensed-black-italic">
                    {{ skill.name }}
                  </h3>
                  <div class="tags">
                    <span class="tag is-info fira-sans-condensed-black-italic">
                      {{ getCategoryLabel(skill.category) }}
                    </span>
                    <span class="tag fira-sans-condensed-black-italic" :class="canRunSkill(skill.id).canRun ? 'is-success' : 'is-warning'">
                      {{ getRequiredLevel(skill) }}
                    </span>
                    <span
                      v-if="skill.author?.verified"
                      class="tag is-warning fira-sans-condensed-black-italic"
                    >
                      Verified
                    </span>
                  </div>
                </div>

                <p class="skill-description">{{ skill.description }}</p>

                <div class="skill-tags mt-3">
                  <span
                    v-for="tag in (skill.tags || []).slice(0, 4)"
                    :key="tag"
                    class="tag is-dark is-small mr-1"
                  >
                    {{ tag }}
                  </span>
                </div>

                <hr />

                <div class="skill-footer">
                  <div class="skill-pricing">
                    <div class="tags has-addons">
                      <span class="tag is-dark fira-sans-condensed-black-italic">
                        {{ skill.pricing?.purchasePrice || '0.1' }}
                        {{ skill.pricing?.purchaseToken || 'ETH' }}
                      </span>
                      <span class="tag is-info fira-sans-condensed-black-italic">
                        {{ skill.pricing?.runningFee || 99 }} BONZAI/run
                      </span>
                    </div>
                  </div>
                  <div class="skill-actions">
                    <template v-if="canRunSkill(skill.id).canRun">
                      <button
                        class="button is-info is-medium"
                        @click="runSkill(skill)"
                      >
                        <span class="material-symbols-outlined mr-1">
                          play_arrow
                        </span>
                        Run
                      </button>
                    </template>
                    <template v-else>
                      <span class="tag is-warning is-medium">
                        <span class="material-symbols-outlined mr-1" style="font-size: 16px;">lock</span>
                        {{ getRequiredLevel(skill) }} Required
                      </span>
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="notification is-info">
              <span class="fira-sans-condensed-black-italic is-size-4">
                No skills found matching your criteria.
              </span>
            </div>
          </div>

          <!-- MY SKILLS TAB -->
          <div v-if="activeTab === 'my-skills'">
            <div v-if="accessibleSkills.length === 0" class="notification is-info">
              <span class="fira-sans-condensed-black-italic is-size-4">
                No skills available at your current level. Upgrade your level to unlock more skills!
              </span>
              <div class="control has-text-center mt-5">
                <button
                  class="button is-success is-large"
                  @click="activeTab = 'browse'"
                >
                  <span class="material-symbols-outlined mr-2">shopping_cart</span>
                  Browse Skills
                </button>
              </div>
            </div>

            <div v-else>
              <!-- Skill Selector -->
              <div class="models__activity--payouts mb-5">
                <div
                  v-if="!isModelAvailable"
                  class="notification is-danger mb-5"
                >
                  <div class="columns is-vcentered">
                    <div class="column">
                      <h3
                        class="is-size-4 mb-0 fira-sans-condensed-black-italic has-text-left"
                      >
                        AI Model Required
                      </h3>
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
                  Available Skills
                </h3>
                <div class="control agent-selector">
                  <template v-for="skill in availableSkills" :key="skill.id">
                    <input
                      type="radio"
                      name="skill_selector"
                      :id="'skill_' + skill.id"
                      :value="skill.id"
                      :checked="selectedSkillId === skill.id"
                      @change="selectSkillById(skill.id)"
                    />
                    <label :for="'skill_' + skill.id" class="radio">
                      {{ skill.name }}
                      <span
                        class="tag is-small ml-2"
                        :class="canRunSkill(skill.id).canRun ? 'is-success' : 'is-warning'"
                        :title="getRequiredLevel(skill)"
                      >
                        {{ getRequiredLevel(skill) }}
                      </span>
                      <span
                        v-if="hasIssuedToken(skill.id)"
                        class="tag is-success is-small ml-2"
                        title="Token Issued"
                      >
                        <span class="material-symbols-outlined" style="font-size: 12px;">
                          token
                        </span>
                      </span>
                    </label>
                  </template>
                </div>

                <!-- Token Issuance Section -->
                <div v-if="selectedSkill" class="token-issuance-section mt-4">
                  <div v-if="hasIssuedToken(selectedSkillId)" class="notification is-success is-light">
                    <div class="columns is-vcentered">
                      <div class="column">
                        <p class="fira-sans-condensed-black-italic">
                          <span class="material-symbols-outlined mr-2" style="vertical-align: middle;">
                            token
                          </span>
                          Token Issued: <strong>{{ getSkillTokenData(selectedSkillId)?.symbol }}</strong>
                        </p>
                        <p class="is-size-7 has-text-grey">
                          Address: {{ getSkillTokenData(selectedSkillId)?.address?.slice(0, 10) }}...{{ getSkillTokenData(selectedSkillId)?.address?.slice(-8) }}
                        </p>
                      </div>
                      <div class="column is-narrow">
                        <a
                          :href="`https://arbiscan.io/token/${getSkillTokenData(selectedSkillId)?.address}`"
                          target="_blank"
                          class="button is-small is-info"
                        >
                          <span class="material-symbols-outlined mr-1" style="font-size: 14px;">
                            open_in_new
                          </span>
                          View on Arbiscan
                        </a>
                      </div>
                    </div>
                  </div>
                  <div v-else class="has-text-right">
                    <button
                      class="button is-warning is-medium fira-sans-condensed-black-italic"
                      @click="openTokenIssuanceModal(selectedSkill)"
                    >
                      <span class="material-symbols-outlined mr-2">
                        generating_tokens
                      </span>
                      Issue Token
                    </button>
                  </div>
                </div>
              </div>

              <hr />

              <!-- POLYMARKET INTERFACE -->
              <div v-if="selectedSkillId === 'polymarket-top-performers-v1.0.0'">
                <div
                  class="models__activity--payouts pt-5 pb-5"
                  style="position: relative; bottom: -40px; z-index: 11"
                >
                  <!-- Category Selector -->
                  <h2
                    class="fira-sans-condensed-black-italic is-size-5 has-text-white has-text-left mb-4"
                  >
                    Category
                  </h2>
                  <div class="columns">
                    <div class="column is-12">
                      <div class="control category-selector polymarket-category">
                        <template
                          v-for="cat in polymarketCategories"
                          :key="cat.key"
                        >
                          <input
                            type="radio"
                            name="polymarket_category_selector"
                            :id="'pmcat_' + cat.key"
                            :value="cat.key"
                            :checked="selectedPolymarketCategory === cat.key"
                            :disabled="isAnalyzing"
                            @change="selectCategoryAndAnalyze(cat.key)"
                          />
                          <label
                            :for="'pmcat_' + cat.key"
                            class="radio"
                            :class="{
                              'is-loading':
                                isAnalyzing &&
                                selectedPolymarketCategory === cat.key,
                            }"
                          >
                            <span
                              v-if="
                                isAnalyzing &&
                                selectedPolymarketCategory === cat.key
                              "
                              class="material-symbols-outlined rotating mr-1"
                              style="font-size: 18px !important"
                            >
                              progress_activity
                            </span>
                            <span
                              v-else
                              class="material-symbols-outlined mr-1"
                              style="font-size: 18px !important"
                            >
                              {{ cat.icon }}
                            </span>
                            {{ cat.label }}
                          </label>
                        </template>
                      </div>
                    </div>
                  </div>

                  <!-- Time Period Selector -->
                  <h2
                    class="fira-sans-condensed-black-italic is-size-5 has-text-white has-text-left mb-4 mt-5"
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
                        class="fira-sans-condensed-black-italic is-size-2 has-text-success mt-5"
                      >
                        <span class="material-symbols-outlined is-size-1 mr-1">
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

              <!-- TCG INTERFACE -->
              <div v-else-if="selectedSkillId === 'tcg-prediction-market-v1.0.0'" class="tcg-interface">
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
                      <div class="columns is-multiline">
                        <div class="column is-12">
                          <div class="sla-preview p-1">
                            <span
                              class="tag is-warning fira-sans-condensed-black-italic is-size-5"
                              style="width: 100%"
                            >
                              <strong>{{ market.question }}</strong>
                            </span>
                          </div>
                          <hr />
                          <!-- Position Display -->
                          <div
                            v-if="getPosition('tcg', market.id)"
                            class="current-positions"
                          >
                            <span
                              v-if="hasPosition('tcg', market.id, 'for')"
                              class="tag is-medium is-success fira-sans-condensed-black-italic mr-2"
                            >
                              FOR:
                              {{ getPosition('tcg', market.id, 'for').amount }}
                              tokens
                            </span>
                            <span
                              v-if="hasPosition('tcg', market.id, 'against')"
                              class="tag is-medium is-danger fira-sans-condensed-black-italic"
                            >
                              AGAINST:
                              {{ getPosition('tcg', market.id, 'against').amount }}
                              tokens
                            </span>
                          </div>
                        </div>
                        <div class="column is-3 is-offset-3">
                          <button
                            class="button is-success fira-sans-condensed-black-italic is-fullwidth"
                            @click="openPositionModal('tcg', market.id, 'for', market)"
                          >
                            <span class="material-symbols-outlined mr-1">
                              thumb_up
                            </span>
                            YES
                          </button>
                        </div>
                        <div class="column is-3">
                          <button
                            class="button is-danger fira-sans-condensed-black-italic is-fullwidth"
                            @click="openPositionModal('tcg', market.id, 'against', market)"
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

              <!-- DSLA SKILL FACTORY -->
              <div v-else-if="selectedSkillId === 'dsla-smart-market-v1.0.0'">
                <div class="models__activity--payouts">
                  <div class="bonzai__agent">
                    <div class="desc">
                      <span
                        class="material-symbols-outlined is-size-1 has-text-white"
                      >
                        build_circle
                      </span>
                      <p class="notification is-info">
                        Create a new Prediction Market Skill using the Decentralized
                        Service Level Agreement (DSLA) framework. Select a use case,
                        define your skill's identity and token economics.
                      </p>
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
                              @change="selectUseCaseAndGenerate(useCase)"
                            />
                            <label
                              :for="'usecase_' + useCase.key"
                              class="radio"
                            >
                              {{ useCase.label }}
                            </label>
                          </template>
                        </div>
                        <p v-if="selectedUseCase" class="has-text-grey-light mt-2 is-size-7">
                          {{ selectedUseCase.context }}
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
                          class="label has-text-white has-text-left fira-sans-condensed-black-italic is-size-5"
                        >
                          Project Name *
                        </label>
                        <div class="control">
                          <input
                            class="input is-large"
                            v-model="projectForm.name"
                            placeholder="Enter project name"
                          />
                        </div>
                      </div>
                      <div class="field column is-6">
                        <label
                          class="label has-text-white has-text-left fira-sans-condensed-black-italic is-size-5"
                        >
                          Token Symbol *
                        </label>
                        <div class="control">
                          <input
                            class="input is-large"
                            v-model="projectForm.tokenSymbol"
                            placeholder="e.g. BTC, ETH, DSLA"
                          />
                        </div>
                      </div>
                    </div>
                    <div class="field">
                      <label
                        class="label has-text-white has-text-left fira-sans-condensed-black-italic is-size-5"
                      >
                        Project Description *
                      </label>
                      <div class="control">
                        <textarea
                          class="textarea is-large"
                          v-model="projectForm.description"
                          placeholder="Describe your project and its goals"
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
                      <div class="field column is-6">
                        <label
                          class="label has-text-white has-text-left fira-sans-condensed-black-italic is-size-5"
                        >
                          Total Supply
                          <span v-if="projectForm.tokenSymbol">
                            ({{ projectForm.tokenSymbol }})
                          </span>
                        </label>
                        <div class="control">
                          <input
                            class="input is-large"
                            v-model="projectForm.totalSupply"
                            placeholder="e.g. 1000000000"
                          />
                        </div>
                      </div>
                      <div class="field column is-6">
                        <label
                          class="label has-text-white has-text-left fira-sans-condensed-black-italic is-size-5"
                        >
                          Price (ETH)
                        </label>
                        <div class="control">
                          <input
                            class="input is-large"
                            type="number"
                            step="0.01"
                            v-model.number="projectForm.price"
                            placeholder="0.1"
                          />
                        </div>
                      </div>
                    </div>

                    <!-- Create Skill Button -->
                    <div class="control mt-4 has-text-centered mt-5">
                      <button
                        class="button is-success is-large mt-5"
                        @click="createPredictionMarketSkill()"
                        :disabled="
                          !projectForm.name ||
                          !projectForm.tokenSymbol ||
                          !selectedUseCase
                        "
                      >
                        <span class="material-symbols-outlined mr-2 is-size-3">
                          build_circle
                        </span>
                        Create Prediction Market Skill
                        <div class="tags has-addons ml-3">
                          <span
                            class="tag is-warning partner fira-sans-condensed-black-italic"
                          >
                            {{ projectForm.price || 0.1 }} ETH
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Roleplay Companion - Special Chat Interface -->
              <div v-else-if="selectedSkillId === 'roleplay-companion-v1.0.0'" class="roleplay-interface">
                <div class="models__activity--payouts mb-4">
                  <!-- Skill Header -->
                  <div class="skill-header-banner">
                    <div class="columns is-vcentered">
                      <div class="column">
                        <div class="is-flex is-align-items-center">
                          <span class="material-symbols-outlined mr-3" style="font-size: 48px; color: var(--bulma-primary);">
                            {{ getCategoryIcon(selectedSkill.category) }}
                          </span>
                          <div>
                            <h3 class="fira-sans-condensed-black-italic is-size-2 has-text-white mb-1">
                              {{ selectedSkill.name }}
                            </h3>
                            <p class="has-text-grey-light">{{ selectedSkill.description }}</p>
                          </div>
                        </div>
                      </div>
                      <div class="column is-narrow">
                        <div class="tags">
                          <span class="tag is-medium" :class="getCategoryColor(selectedSkill.category)">
                            {{ getCategoryLabel(selectedSkill.category) }}
                          </span>
                          <span class="tag is-info is-medium">{{ getRequiredLevel(selectedSkill) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Model Requirements (matching GenerativeImage style) -->
                <div v-if="skillModelRequirements.length > 0 && hasMissingModels" class="notification is-danger mb-6 mt-4 p-6 has-text-left">
                  <p class="mb-2">
                    <strong class="fira-sans-condensed-black-italic is-size-2">
                      Download Required
                    </strong>
                    <!-- Show missing repos -->
                    <template v-for="model in missingModels" :key="model.key">
                      <ul v-if="modelReadinessDetails[model.key]?.repos?.length" style="margin-top: 0.5rem; text-transform: lowercase">
                        <li v-for="repo in modelReadinessDetails[model.key].repos" :key="repo">
                          <span class="material-symbols-outlined is-size-4 mr-1">
                            deployed_code
                          </span>
                          {{ repo }}
                        </li>
                      </ul>
                      <!-- Show missing files -->
                      <ul v-if="modelReadinessDetails[model.key]?.files?.length" style="margin-top: 0.5rem; text-transform: lowercase">
                        <li v-for="file in modelReadinessDetails[model.key].files" :key="file">
                          <span class="material-symbols-outlined is-size-4 mr-1">
                            deployed_code
                          </span>
                          {{ file }}
                        </li>
                      </ul>
                      <!-- Fallback if no details available (show filename for LLM, repo for others) -->
                      <ul v-if="!modelReadinessDetails[model.key]?.repos?.length && !modelReadinessDetails[model.key]?.files?.length" style="margin-top: 0.5rem; text-transform: lowercase">
                        <li>
                          <span class="material-symbols-outlined is-size-4 mr-1">
                            deployed_code
                          </span>
                          {{ model.filename || model.repo || model.name }}
                        </li>
                      </ul>
                    </template>
                  </p>
                  <hr />
                  <div class="buttons">
                    <button
                      class="button is-warning mr-5 is-large"
                      @click="downloadAllMissingModels"
                      :disabled="downloadingModelKey !== null"
                    >
                      <span v-if="downloadingModelKey" class="material-symbols-outlined mr-1 rotating">
                        progress_activity
                      </span>
                      <span v-else class="material-symbols-outlined mr-1">
                        download
                      </span>
                      {{ downloadingModelKey ? `Downloading... ${downloadProgress}%` : 'Download Now' }}
                    </button>
                  </div>
                </div>

                <!-- Roleplay Chat Component -->
                <RoleplayChat
                  :skill="selectedSkill"
                  @charge-fee="handleRoleplayFee"
                />
              </div>

              <!-- Generic Skill Interface (for other flagship skills) -->
              <div v-else-if="selectedSkill" class="generic-skill-interface">
                <div class="models__activity--payouts">
                  <!-- Skill Header -->
                  <div class="skill-header-banner mb-5">
                    <div class="columns is-vcentered">
                      <div class="column">
                        <div class="is-flex is-align-items-center">
                          <span class="material-symbols-outlined mr-3" style="font-size: 48px; color: var(--bulma-primary);">
                            {{ getCategoryIcon(selectedSkill.category) }}
                          </span>
                          <div>
                            <h3 class="fira-sans-condensed-black-italic is-size-2 has-text-white mb-1">
                              {{ selectedSkill.name }}
                            </h3>
                            <p class="has-text-grey-light">{{ selectedSkill.description }}</p>
                          </div>
                        </div>
                      </div>
                      <div class="column is-narrow">
                        <div class="tags">
                          <span class="tag is-medium" :class="getCategoryColor(selectedSkill.category)">
                            {{ getCategoryLabel(selectedSkill.category) }}
                          </span>
                          <span class="tag is-info is-medium">{{ getRequiredLevel(selectedSkill) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Model Requirements Section -->
                  <div v-if="skillModelRequirements.length > 0" class="model-requirements-section mb-5">
                    <h4 class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-5 mb-3">
                      <span class="material-symbols-outlined mr-2" style="vertical-align: middle;">deployed_code</span>
                      Required Models
                    </h4>

                    <!-- Loading state while checking -->
                    <div v-if="!modelAvailabilityChecked" class="notification is-info mb-4">
                      <span class="material-symbols-outlined rotating mr-2" style="vertical-align: middle;">progress_activity</span>
                      Checking model availability...
                    </div>

                    <!-- Missing Models Warning -->
                    <div v-else-if="hasMissingModels" class="notification is-danger mb-4 p-6">
                      <p class="mb-3">
                        <strong class="fira-sans-condensed-black-italic is-size-2">
                          Download Required
                        </strong>
                      </p>
                      <!-- Show missing repos and files for each model -->
                      <template v-for="model in missingModels" :key="model.key">
                        <ul v-if="modelReadinessDetails[model.key]?.repos?.length" style="margin-top: 0.5rem; text-transform: lowercase">
                          <li v-for="repo in modelReadinessDetails[model.key].repos" :key="repo">
                            <span class="material-symbols-outlined is-size-3 mr-1">
                              deployed_code
                            </span>
                            {{ repo }}
                          </li>
                        </ul>
                        <ul v-if="modelReadinessDetails[model.key]?.files?.length" style="margin-top: 0.5rem; text-transform: lowercase">
                          <li v-for="file in modelReadinessDetails[model.key].files" :key="file">
                            <span class="material-symbols-outlined is-size-3 mr-1">
                              deployed_code
                            </span>
                            {{ file }}
                          </li>
                        </ul>
                        <!-- Fallback if no details available (show filename for LLM, repo for others) -->
                        <ul v-if="!modelReadinessDetails[model.key]?.repos?.length && !modelReadinessDetails[model.key]?.files?.length" style="margin-top: 0.5rem; text-transform: lowercase">
                          <li>
                            <span class="material-symbols-outlined is-size-3 mr-1">
                              deployed_code
                            </span>
                            {{ model.filename || model.repo || model.name }}
                          </li>
                        </ul>
                      </template>
                      <hr />
                      <div class="buttons">
                        <button
                          class="button is-warning mr-5 is-large"
                          @click="downloadAllMissingModels"
                          :disabled="downloadingModelKey !== null"
                        >
                          <span v-if="downloadingModelKey" class="material-symbols-outlined mr-1 rotating">
                            progress_activity
                          </span>
                          <span v-else class="material-symbols-outlined mr-1">
                            download
                          </span>
                          {{ downloadingModelKey ? `Downloading... ${downloadProgress}%` : 'Download Now' }}
                        </button>
                      </div>
                    </div>

                    <!-- All models ready - show as tags -->
                    <div v-else class="available-models-tags">
                      <span
                        v-for="model in skillModelRequirements"
                        :key="model.key"
                        class="tag is-medium is-success mr-2 mb-2"
                      >
                        <span class="material-symbols-outlined mr-1" style="font-size: 14px;">check_circle</span>
                        {{ model.name }}
                        <span class="ml-1 has-text-grey-light" style="font-size: 10px;">({{ model.vram }})</span>
                      </span>
                    </div>
                  </div>

                  <!-- LLM Auto-Fill Section -->
                  <div class="autofill-section models__activity--payouts mb-5 p-4" style="background: rgba(0,0,0,0.3); border-radius: 8px;">
                    <div class="columns is-vcentered">
                      <div class="column">
                        <h4 class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-5">
                          <span class="material-symbols-outlined mr-2" style="vertical-align: middle;">auto_awesome</span>
                          AI Auto-Fill
                        </h4>
                        <p class="has-text-grey-light is-size-7 has-text-left">
                          Describe what you want and let AI fill in the details
                        </p>
                      </div>
                      <div class="column is-narrow">
                        <button
                          class="button is-info"
                          :disabled="!autoFillPrompt || isAutoFilling"
                          @click="autoFillSkillInputs"
                        >
                          <span v-if="isAutoFilling" class="material-symbols-outlined rotating mr-1">progress_activity</span>
                          <span v-else class="material-symbols-outlined mr-1">magic_button</span>
                          {{ isAutoFilling ? 'Generating...' : 'Generate' }}
                        </button>
                      </div>
                    </div>
                    <div class="field mt-3">
                      <div class="control">
                        <textarea
                          v-model="autoFillPrompt"
                          class="textarea"
                          placeholder="Describe what you want to create (e.g., 'A cozy coffee shop scene with warm lighting and jazz music')..."
                          rows="2"
                          :disabled="isAutoFilling"
                        ></textarea>
                      </div>
                    </div>
                  </div>

                  <!-- Skill Inputs - Visual Selectors -->
                  <div class="skill-inputs-visual">
                    <template v-for="(field, key) in selectedSkill.inputs" :key="key">
                      <!-- Select type: Visual card selector -->
                      <div v-if="field.type === 'select'" class="input-section mb-5">
                        <h4 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">
                          {{ field.label || key }}
                        </h4>
                        <div class="control visual-selector">
                          <template v-for="opt in field.options" :key="opt">
                            <input
                              type="radio"
                              :name="'skill_input_' + key"
                              :id="'input_' + key + '_' + opt"
                              :value="opt"
                              :checked="skillInputs[key] === opt"
                              @change="skillInputs[key] = opt"
                            />
                            <label :for="'input_' + key + '_' + opt" class="radio">
                              {{ formatOptionLabel(opt) }}
                            </label>
                          </template>
                        </div>
                        <p v-if="field.description" class="help has-text-grey-light mt-2">
                          {{ field.description }}
                        </p>
                      </div>

                      <!-- Boolean type: Toggle switch -->
                      <div v-else-if="field.type === 'boolean'" class="input-section mb-5">
                        <div class="is-flex is-align-items-center is-justify-content-space-between">
                          <div>
                            <h4 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-1">
                              {{ field.label || key }}
                            </h4>
                            <p v-if="field.description" class="help has-text-grey-light">
                              {{ field.description }}
                            </p>
                          </div>
                          <label class="switch">
                            <input type="checkbox" v-model="skillInputs[key]" />
                            <span class="slider"></span>
                          </label>
                        </div>
                      </div>

                      <!-- Number type: Styled input with +/- buttons -->
                      <div v-else-if="field.type === 'number'" class="input-section mb-5">
                        <h4 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">
                          {{ field.label || key }}
                        </h4>
                        <div class="field has-addons number-input-group">
                          <div class="control">
                            <button
                              class="button is-dark"
                              @click="skillInputs[key] = Math.max(field.min || 0, (skillInputs[key] || 0) - 1)"
                            >
                              <span class="material-symbols-outlined">remove</span>
                            </button>
                          </div>
                          <div class="control is-expanded">
                            <input
                              class="input has-text-centered"
                              type="number"
                              v-model.number="skillInputs[key]"
                              :min="field.min"
                              :max="field.max"
                            />
                          </div>
                          <div class="control">
                            <button
                              class="button is-dark"
                              @click="skillInputs[key] = Math.min(field.max || 999, (skillInputs[key] || 0) + 1)"
                            >
                              <span class="material-symbols-outlined">add</span>
                            </button>
                          </div>
                        </div>
                        <p v-if="field.description" class="help has-text-grey-light mt-2">
                          {{ field.description }}
                        </p>
                      </div>

                      <!-- Image type: File upload with preview -->
                      <div v-else-if="field.type === 'image'" class="input-section mb-5">
                        <h4 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">
                          {{ field.label || key }}
                        </h4>
                        <div class="image-upload-area">
                          <div v-if="skillInputs[key]" class="image-preview mb-3">
                            <img :src="'data:image/png;base64,' + skillInputs[key]" alt="Preview" class="preview-image" />
                            <button class="button is-small is-danger is-light mt-2" @click="skillInputs[key] = ''">
                              <span class="material-symbols-outlined mr-1">delete</span>
                              Remove
                            </button>
                          </div>
                          <div v-else class="file is-boxed is-fullwidth">
                            <label class="file-label">
                              <input
                                class="file-input"
                                type="file"
                                accept="image/*"
                                @change="handleImageUpload($event, key)"
                              />
                              <span class="file-cta">
                                <span class="file-icon">
                                  <span class="material-symbols-outlined">upload</span>
                                </span>
                                <span class="file-label fira-sans-condensed-black-italic">
                                  Upload Image
                                </span>
                              </span>
                            </label>
                          </div>
                        </div>
                        <p v-if="field.description" class="help has-text-grey-light mt-2">
                          {{ field.description }}
                        </p>
                      </div>

                      <!-- String type: Styled textarea for longer inputs -->
                      <div v-else class="input-section mb-5">
                        <h4 class="fira-sans-condensed-black-italic is-size-5 has-text-white mb-3">
                          {{ field.label || key }}
                        </h4>
                        <div class="control">
                          <textarea
                            v-if="(field.description || '').includes('Describe') || key.includes('description') || key.includes('idea') || key.includes('summary')"
                            class="textarea"
                            v-model="skillInputs[key]"
                            :placeholder="field.description || String(field.default || '')"
                            rows="3"
                          ></textarea>
                          <input
                            v-else
                            class="input is-medium"
                            type="text"
                            v-model="skillInputs[key]"
                            :placeholder="field.description || String(field.default || '')"
                          />
                        </div>
                      </div>
                    </template>
                  </div>

                  <!-- Execute Button -->
                  <div class="control mt-5">
                    <button
                      class="button is-success is-large is-fullwidth"
                      @click="executeSelectedSkill"
                      :disabled="isExecuting || hasMissingModels"
                    >
                      <span
                        v-if="isExecuting"
                        class="material-symbols-outlined mr-2 rotating"
                      >
                        progress_activity
                      </span>
                      <span v-else class="material-symbols-outlined mr-2">
                        auto_awesome
                      </span>
                      <span class="fira-sans-condensed-black-italic is-size-4">
                        {{ isExecuting ? executionStatus : 'Generate' }}
                      </span>
                      <span class="tag is-warning ml-3 fira-sans-condensed-black-italic">
                        {{ selectedSkill.pricing?.runningFee || 99 }} BONZAI
                      </span>
                    </button>
                    <p v-if="selectedSkill" class="help has-text-info has-text-centered mt-2">
                      <span class="material-symbols-outlined mr-1" style="font-size: 14px; vertical-align: middle;">verified</span>
                      {{ getRequiredLevel(selectedSkill) }} - {{ selectedSkill.requirements?.requiredApis?.join(', ') || 'text' }}
                    </p>
                  </div>

                  <!-- Execution Results - Rich Display -->
                  <div
                    v-if="executionResults[selectedSkillId]"
                    class="execution-results mt-5"
                  >
                    <h4 class="fira-sans-condensed-black-italic is-size-4 has-text-white mb-4">
                      <span class="material-symbols-outlined mr-2" style="vertical-align: middle;">auto_awesome</span>
                      Generated Content
                    </h4>

                    <!-- Render results based on skill output type -->
                    <div class="results-container">
                      <!-- Story/Narrative Results -->
                      <template v-if="executionResults[selectedSkillId].story">
                        <div class="result-section story-result">
                          <div v-if="executionResults[selectedSkillId].story.coverImage" class="cover-image mb-4">
                            <img :src="'data:image/png;base64,' + executionResults[selectedSkillId].story.coverImage" alt="Cover" class="generated-image" />
                          </div>
                          <h3 class="is-size-3 has-text-white mb-2">{{ executionResults[selectedSkillId].story.title }}</h3>
                          <p class="has-text-grey-light mb-4">{{ executionResults[selectedSkillId].story.synopsis }}</p>
                          <div v-for="(scene, idx) in executionResults[selectedSkillId].story.scenes" :key="idx" class="scene-card mb-4">
                            <div class="columns">
                              <div class="column is-4" v-if="scene.image">
                                <img :src="'data:image/png;base64,' + scene.image" alt="Scene" class="generated-image" />
                              </div>
                              <div class="column">
                                <h4 class="is-size-5 has-text-white">{{ scene.title }}</h4>
                                <p class="has-text-grey-light">{{ scene.narrative }}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </template>

                      <!-- Image Gallery Results -->
                      <template v-else-if="hasImageResults(executionResults[selectedSkillId])">
                        <div class="image-gallery">
                          <div class="columns is-multiline">
                            <template v-for="(img, idx) in extractImages(executionResults[selectedSkillId])" :key="idx">
                              <div class="column is-4">
                                <div class="generated-image-card">
                                  <img :src="'data:image/png;base64,' + img.data" :alt="img.label" class="generated-image" />
                                  <p class="has-text-centered has-text-grey-light mt-2">{{ img.label }}</p>
                                </div>
                              </div>
                            </template>
                          </div>
                        </div>
                      </template>

                      <!-- Recipe Results -->
                      <template v-else-if="executionResults[selectedSkillId].recipe">
                        <div class="recipe-result">
                          <div class="columns">
                            <div class="column is-5" v-if="executionResults[selectedSkillId].recipe.dishImage">
                              <img :src="'data:image/png;base64,' + executionResults[selectedSkillId].recipe.dishImage" alt="Dish" class="generated-image" />
                            </div>
                            <div class="column">
                              <h3 class="is-size-3 has-text-white">{{ executionResults[selectedSkillId].recipe.name }}</h3>
                              <p class="has-text-grey-light mb-3">{{ executionResults[selectedSkillId].recipe.description }}</p>
                              <div class="tags">
                                <span class="tag is-info">{{ executionResults[selectedSkillId].recipe.prepTime }} min prep</span>
                                <span class="tag is-warning">{{ executionResults[selectedSkillId].recipe.cookTime }} min cook</span>
                              </div>
                              <h4 class="is-size-5 has-text-white mt-4 mb-2">Ingredients</h4>
                              <ul>
                                <li v-for="(ing, idx) in executionResults[selectedSkillId].recipe.ingredients" :key="idx" class="has-text-grey-light">
                                  {{ ing.amount }} {{ ing.unit }} {{ ing.item }}
                                </li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </template>

                      <!-- Generic JSON Results (fallback) -->
                      <template v-else>
                        <div class="notification is-dark">
                          <pre class="has-text-success" style="white-space: pre-wrap;">{{ JSON.stringify(executionResults[selectedSkillId], null, 2) }}</pre>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- CREATE TAB (Agentic Workflow Builder) -->
          <div v-if="activeTab === 'create'">
            <div class="models__activity--payouts">
              <div class="bonzai__agent">
                <!-- Model Download Section -->
                <div v-if="!isModelAvailable" class="notification is-danger mb-5">
                  <div class="columns is-vcentered">
                    <div class="column">
                      <h3 class="is-size-4 mb-0 fira-sans-condensed-black-italic has-text-left">
                        AI Model Required for Skill Generation
                      </h3>
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
                        <span v-else class="filesize ml-2" style="font-size: 14px">
                          4.08 GB
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Skill Identity -->
                <h2 class="fira-sans-condensed-black-italic is-size-2 has-text-white has-text-left mb-4">
                  Skill Identity
                </h2>
                <div class="columns">
                  <div class="field column is-6">
                    <label class="label has-text-white has-text-left fira-sans-condensed-black-italic is-size-5">
                      Skill Name *
                    </label>
                    <div class="control">
                      <input
                        class="input is-large"
                        v-model="skillForm.name"
                        placeholder="Enter skill name"
                      />
                    </div>
                  </div>
                  <div class="field column is-3">
                    <label class="label has-text-white has-text-left fira-sans-condensed-black-italic is-size-5">
                      Category
                    </label>
                    <div class="control">
                      <div class="select is-large is-fullwidth">
                        <select v-model="skillForm.category">
                          <option
                            v-for="cat in categories"
                            :key="cat.key"
                            :value="cat.key"
                          >
                            {{ cat.label }}
                          </option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div class="field column is-3">
                    <label class="label has-text-white has-text-left fira-sans-condensed-black-italic is-size-5">
                      Price (ETH)
                    </label>
                    <div class="control">
                      <input
                        class="input is-large"
                        type="number"
                        step="0.01"
                        v-model.number="skillForm.price"
                        placeholder="0.1"
                      />
                    </div>
                  </div>
                </div>
                <div class="field">
                  <label class="label has-text-white has-text-left fira-sans-condensed-black-italic is-size-5">
                    Description *
                  </label>
                  <div class="control">
                    <textarea
                      class="textarea is-large"
                      v-model="skillForm.description"
                      placeholder="Describe what your skill does"
                    ></textarea>
                  </div>
                </div>

                <hr class="mt-5 mb-5" />

                <!-- Agentic Workflow -->
                <h2 class="fira-sans-condensed-black-italic is-size-2 has-text-white has-text-left mb-4">
                  Agentic Workflow
                </h2>
                <p class="has-text-white has-text-left mb-4">
                  Define the steps your skill will execute. Each step can use different AI capabilities.
                </p>

                <div class="workflow-steps">
                  <div
                    v-for="(step, idx) in skillForm.steps"
                    :key="idx"
                    class="workflow-step box mb-4"
                  >
                    <div class="step-header">
                      <span class="tag is-info is-large fira-sans-condensed-black-italic">
                        Step {{ idx + 1 }}
                      </span>
                      <button
                        class="delete is-medium"
                        @click="removeStep(idx)"
                      ></button>
                    </div>

                    <div class="columns mt-3">
                      <div class="field column is-4">
                        <label class="label has-text-white fira-sans-condensed-black-italic">
                          Task Type
                        </label>
                        <div class="control">
                          <div class="select is-fullwidth">
                            <select v-model="step.type">
                              <option value="script">Script (Text)</option>
                              <option value="picture">Picture (Image)</option>
                              <option value="motion">Motion (Video)</option>
                              <option value="speech">Speech (TTS)</option>
                              <option value="soundtrack">Soundtrack (Audio)</option>
                              <option value="asset">Asset (3D)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <div class="field column is-4">
                        <label class="label has-text-white fira-sans-condensed-black-italic">
                          Mode
                        </label>
                        <div class="control">
                          <div class="select is-fullwidth">
                            <select v-model="step.mode">
                              <option value="one-pass">One-Pass</option>
                              <option value="multi-pass">Multi-Pass</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <div class="field column is-4">
                        <label class="label has-text-white fira-sans-condensed-black-italic">
                          Reasoning
                        </label>
                        <div class="control">
                          <div class="select is-fullwidth">
                            <select v-model="step.reasoning">
                              <option value="offline">Offline (Local)</option>
                              <option value="online">Online (API)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="field mt-3">
                      <label class="label has-text-white fira-sans-condensed-black-italic">
                        Prompt Template
                      </label>
                      <div class="control">
                        <textarea
                          class="textarea"
                          v-model="step.prompt"
                          placeholder="Enter the prompt for this step. Use {{input}} for dynamic values."
                          rows="3"
                        ></textarea>
                      </div>
                      <p class="help has-text-grey-light">
                        Use <code v-pre>{{previousStep}}</code> to reference the output of the previous step.
                      </p>
                    </div>
                  </div>
                </div>

                <div class="control has-text-left mt-4">
                  <button
                    class="button is-info is-large"
                    @click="addStep"
                  >
                    <span class="material-symbols-outlined mr-2">add</span>
                    Add Step
                  </button>
                </div>

                <hr class="mt-5 mb-5" />

                <!-- Publish -->
                <div class="control mt-4 has-text-centered">
                  <button
                    class="button is-success is-large mt-5"
                    @click="publishSkill"
                    :disabled="!skillForm.name || !skillForm.description || skillForm.steps.length === 0"
                  >
                    <span class="material-symbols-outlined mr-2 is-size-3">
                      rocket_launch
                    </span>
                    Publish Skill
                    <div class="tags has-addons ml-3">
                      <span class="tag is-warning partner fira-sans-condensed-black-italic">
                        1 ETH
                      </span>
                    </div>
                  </button>
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
      </div>
    </div>

    <!-- Position Modal -->
    <div
      v-if="positionModal.show"
      class="position-modal-overlay"
      @click.self="closePositionModal"
    >
      <div class="position-modal" :class="positionModal.side === 'for' ? 'is-for' : 'is-against'">
        <div class="has-text-right">
          <button
            class="button is-danger"
            @click="closePositionModal"
            title="Close"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="position-modal-header has-text-center">
          <span class="material-symbols-outlined is-size-1">
            {{ positionModal.side === 'for' ? 'thumb_up' : 'thumb_down' }}
          </span>
          <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-centered">
            Open {{ positionModal.side === 'for' ? 'FOR' : 'AGAINST' }} Position
          </h2>
        </div>

        <div class="position-modal-body">
          <div class="position-market-preview">
            <div class="position-modal-status mb-4">
              <span class="position-status-pill fira-sans-condensed-black-italic is-size-6">
                {{ positionModal.side === 'for' ? 'STAKING YES' : 'STAKING NO' }}
              </span>
            </div>
            <p class="position-question has-text-centered">
              {{ positionModal.market?.question }}
            </p>
          </div>

          <div class="position-form-section">
            <div class="position-field">
              <label class="position-label fira-sans-condensed-black-italic is-size-5 has-text-left">
                Amount (BONZAI)
              </label>
              <input
                class="position-input"
                type="number"
                v-model="positionModal.amount"
                min="1"
                placeholder="Enter amount"
              />
            </div>
          </div>

          <div class="position-preview-box">
            <p class="position-preview-text p-0 m-0 has-text-centered">
              You are staking
              <strong>{{ positionModal.amount || 0 }} tokens</strong>
              that the condition will
              <strong>{{ positionModal.side === "for" ? "be met" : "NOT be met" }}</strong>
              by the target date.
            </p>
          </div>
        </div>

        <div class="position-modal-footer mb-5">
          <button
            class="button position-primary-btn is-medium fira-sans-condensed-black-italic"
            @click="confirmPosition"
            :disabled="!positionModal.amount || positionModal.amount <= 0"
          >
            <span class="material-symbols-outlined mr-2">check</span>
            Confirm Position
          </button>
          <button
            class="button is-danger is-medium"
            @click="closePositionModal"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- TCG Market Creation Modal -->
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

            <!-- Data Sources Section -->
            <div class="tcg-field mt-5">
              <label class="tcg-label fira-sans-condensed-black-italic">
                <span class="material-symbols-outlined mr-1" style="font-size: 18px; vertical-align: middle;">
                  database
                </span>
                Data Sources
              </label>
              <p class="has-text-grey-light is-size-7 mb-3">
                API endpoints used to verify the market outcome
              </p>

              <div
                v-for="(source, idx) in tcgMarketModal.dataSources"
                :key="idx"
                class="data-source-item mb-3"
              >
                <div class="columns is-mobile is-vcentered mb-0">
                  <div class="column is-4">
                    <input
                      class="tcg-input is-small"
                      v-model="source.name"
                      placeholder="Source name"
                    />
                  </div>
                  <div class="column">
                    <input
                      class="tcg-input is-small"
                      v-model="source.endpoint"
                      placeholder="https://api.example.com/..."
                    />
                  </div>
                  <div class="column is-narrow">
                    <button
                      class="button is-small is-danger"
                      @click="removeDataSource(idx)"
                      :disabled="tcgMarketModal.dataSources.length <= 1"
                    >
                      <span class="material-symbols-outlined" style="font-size: 14px;">
                        delete
                      </span>
                    </button>
                  </div>
                </div>
                <input
                  class="tcg-input is-small"
                  v-model="source.description"
                  placeholder="Description (optional)"
                />
              </div>

              <button
                class="button is-small is-info"
                @click="addDataSource"
              >
                <span class="material-symbols-outlined mr-1" style="font-size: 14px;">
                  add
                </span>
                Add Data Source
              </button>
            </div>
          </div>

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
              !tcgMarketModal.targetPrice ||
              !tcgMarketModal.targetDate ||
              !tcgMarketModal.dataSources.some(s => s.name && s.endpoint)
            "
          >
            <span class="material-symbols-outlined mr-2">
              online_prediction
            </span>
            Issue Market
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

    <!-- Token Issuance Modal -->
    <div
      v-if="tokenIssuanceModal.show"
      class="tcg-modal-overlay"
      @click.self="closeTokenIssuanceModal"
    >
      <div class="tcg-modal token-modal">
        <div class="has-text-right">
          <button
            class="button is-danger"
            @click="closeTokenIssuanceModal"
            title="Close"
            :disabled="tokenIssuanceModal.isIssuing"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="tcg-modal-header has-text-center">
          <span class="material-symbols-outlined is-size-1">
            generating_tokens
          </span>
          <h2
            class="fira-sans-condensed-black-italic is-size-3 has-text-centered"
          >
            Issue Skill Token
          </h2>
          <p class="has-text-grey-light mt-2">
            {{ tokenIssuanceModal.skill?.name }}
          </p>
        </div>

        <div class="tcg-modal-body">
          <!-- Token Identity -->
          <div class="tcg-form-section has-text-left">
            <h4 class="fira-sans-condensed-black-italic has-text-white mb-3">
              Token Identity
            </h4>
            <div class="columns">
              <div class="column is-8">
                <div class="tcg-field">
                  <label class="tcg-label fira-sans-condensed-black-italic">
                    Token Name
                  </label>
                  <input
                    class="tcg-input"
                    v-model="tokenIssuanceModal.tokenName"
                    placeholder="My Skill Token"
                    :disabled="tokenIssuanceModal.isIssuing"
                  />
                </div>
              </div>
              <div class="column is-4">
                <div class="tcg-field">
                  <label class="tcg-label fira-sans-condensed-black-italic">
                    Symbol
                  </label>
                  <input
                    class="tcg-input"
                    v-model="tokenIssuanceModal.tokenSymbol"
                    placeholder="SKILL"
                    maxlength="8"
                    :disabled="tokenIssuanceModal.isIssuing"
                  />
                </div>
              </div>
            </div>

            <div class="tcg-field mt-4">
              <label class="tcg-label fira-sans-condensed-black-italic">
                Total Supply
              </label>
              <input
                class="tcg-input"
                v-model="tokenIssuanceModal.totalSupply"
                type="number"
                min="1"
                placeholder="1000000000"
                :disabled="tokenIssuanceModal.isIssuing"
              />
            </div>
          </div>

          <hr class="modal-divider" />

          <!-- Liquidity Settings -->
          <div class="tcg-form-section has-text-left">
            <h4 class="fira-sans-condensed-black-italic has-text-white mb-3">
              <span class="material-symbols-outlined mr-1" style="vertical-align: middle; font-size: 20px;">
                water_drop
              </span>
              Initial Liquidity (Uniswap V3)
            </h4>

            <div class="columns">
              <div class="column is-6">
                <div class="tcg-field">
                  <label class="tcg-label fira-sans-condensed-black-italic">
                    Tokens for Liquidity
                  </label>
                  <input
                    class="tcg-input"
                    v-model="tokenIssuanceModal.initialLiquidityTokens"
                    type="number"
                    min="1"
                    :disabled="tokenIssuanceModal.isIssuing"
                  />
                  <p class="help has-text-grey-light">
                    {{ Math.round((tokenIssuanceModal.initialLiquidityTokens / tokenIssuanceModal.totalSupply) * 100) || 0 }}% of supply
                  </p>
                </div>
              </div>
              <div class="column is-6">
                <div class="tcg-field">
                  <label class="tcg-label fira-sans-condensed-black-italic">
                    ETH for Liquidity
                  </label>
                  <input
                    class="tcg-input"
                    v-model="tokenIssuanceModal.initialLiquidityEth"
                    type="number"
                    step="0.01"
                    min="0"
                    @input="calculateDslaFromEth"
                    :disabled="tokenIssuanceModal.isIssuing"
                  />
                </div>
              </div>
            </div>

            <div class="tcg-field mt-4">
              <label class="tcg-label fira-sans-condensed-black-italic">
                Starting Price (ETH per token)
              </label>
              <input
                class="tcg-input"
                v-model="tokenIssuanceModal.startingPriceEth"
                type="number"
                step="0.0000001"
                min="0"
                :disabled="tokenIssuanceModal.isIssuing"
              />
            </div>

            <!-- DSLA Pool (for prediction market skills) -->
            <div v-if="isDslaSkill(tokenIssuanceModal.skill)" class="dsla-pool-section mt-5">
              <h5 class="fira-sans-condensed-black-italic has-text-info mb-3">
                <span class="material-symbols-outlined mr-1" style="vertical-align: middle; font-size: 18px;">
                  currency_exchange
                </span>
                DSLA Pool (Prediction Market)
              </h5>

              <div class="notification is-info is-light mb-3">
                <p class="is-size-7">
                  As a DSLA prediction market skill, an additional SKILL/DSLA liquidity pool will be created.
                </p>
              </div>

              <div class="columns is-vcentered">
                <div class="column is-6">
                  <div class="tcg-field">
                    <label class="tcg-label fira-sans-condensed-black-italic">
                      DSLA for Liquidity
                    </label>
                    <input
                      class="tcg-input"
                      v-model="tokenIssuanceModal.initialLiquidityDsla"
                      type="number"
                      min="0"
                      :disabled="tokenIssuanceModal.isIssuing"
                    />
                  </div>
                </div>
                <div class="column is-6">
                  <div class="dsla-price-info">
                    <p class="is-size-7 has-text-grey-light">
                      Current DSLA/ETH:
                      <span v-if="isFetchingDslaPrice" class="has-text-warning">
                        Loading...
                      </span>
                      <span v-else-if="dslaEthPrice" class="has-text-success">
                        {{ dslaEthPrice.toFixed(10) }} ETH
                      </span>
                      <span v-else class="has-text-danger">
                        Unavailable
                      </span>
                    </p>
                    <p v-if="dslaEthPrice && tokenIssuanceModal.startingPriceEth" class="is-size-7 has-text-grey-light mt-1">
                      Starting Price in DSLA:
                      <strong class="has-text-info">
                        {{ (parseFloat(tokenIssuanceModal.startingPriceEth) / dslaEthPrice).toFixed(2) }} DSLA
                      </strong>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Progress -->
          <div v-if="tokenIssuanceModal.isIssuing" class="issuance-progress mt-4">
            <div class="notification is-warning">
              <div class="columns is-vcentered">
                <div class="column is-narrow">
                  <span class="material-symbols-outlined rotating" style="font-size: 32px;">
                    progress_activity
                  </span>
                </div>
                <div class="column">
                  <p class="fira-sans-condensed-black-italic">
                    {{ tokenIssuanceModal.progress.message || 'Processing...' }}
                  </p>
                  <p class="is-size-7 has-text-grey">
                    Step {{ tokenIssuanceModal.progress.step }} of {{ tokenIssuanceModal.progress.total }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Summary -->
          <div v-if="!tokenIssuanceModal.isIssuing" class="tcg-preview-box mt-4">
            <p class="tcg-preview-text has-text-centered">
              <strong>{{ tokenIssuanceModal.tokenSymbol }}</strong> token will be created with
              <strong>{{ Number(tokenIssuanceModal.totalSupply).toLocaleString() }}</strong> total supply.
              <br />
              <span class="is-size-7">
                SKILL/ETH pool with {{ tokenIssuanceModal.initialLiquidityEth }} ETH liquidity
                <span v-if="isDslaSkill(tokenIssuanceModal.skill) && tokenIssuanceModal.initialLiquidityDsla">
                  + SKILL/DSLA pool with {{ Number(tokenIssuanceModal.initialLiquidityDsla).toLocaleString() }} DSLA
                </span>
              </span>
            </p>
          </div>
        </div>

        <div class="tcg-modal-footer mb-5">
          <button
            class="button tcg-primary-btn is-medium fira-sans-condensed-black-italic"
            @click="issueToken"
            :disabled="
              tokenIssuanceModal.isIssuing ||
              !tokenIssuanceModal.tokenName ||
              !tokenIssuanceModal.tokenSymbol ||
              !tokenIssuanceModal.totalSupply ||
              !tokenIssuanceModal.initialLiquidityEth
            "
          >
            <span v-if="tokenIssuanceModal.isIssuing" class="material-symbols-outlined rotating mr-2">
              progress_activity
            </span>
            <span v-else class="material-symbols-outlined mr-2">
              rocket_launch
            </span>
            {{ tokenIssuanceModal.isIssuing ? 'Issuing...' : 'Issue Token & Create Pool' }}
          </button>
          <button
            class="button is-danger is-medium"
            @click="closeTokenIssuanceModal"
            :disabled="tokenIssuanceModal.isIssuing"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, watch } from "vue";
import VueMarkdown from "vue-markdown-render";
import { useSkillStore } from "../stores/skillStore.js";
import { SKILL_CATEGORY_META } from "../skills/types.js";
import polymarketAgent from "./polymarketAgent.js";
import { tokenService } from "../services/token.service.js";
import SkillRunner from "./skills/SkillRunner.vue";
import RoleplayChat from "./skills/RoleplayChat.vue";
import { getSkillModelRequirements, MODEL_REQUIREMENTS } from "../skills/flagship.js";

export default {
  name: "SmartAgent",
  components: { VueMarkdown, SkillRunner, RoleplayChat },
  setup() {
    // Store
    const skillStore = useSkillStore();

    // Tab state
    const activeTab = ref("browse");

    // Notifications
    const statusNotification = ref({ show: false, message: "", type: "info" });

    // Model state
    const isModelAvailable = ref(false);
    const isModelLoaded = ref(false);
    const isDownloading = ref(false);
    const downloadProgress = ref(0);
    const isAnalyzing = ref(false);
    const isGenerating = ref(false);
    const loadingMessage = ref("");

    // Skill execution state
    const selectedSkillId = ref(null);
    const selectedSkill = computed(() => skillStore.getSkillById(selectedSkillId.value));
    const skillInputs = reactive({});
    const isExecuting = ref(false);
    const executionStatus = ref("");
    const executionResults = reactive({});

    // Model requirements state
    const modelAvailability = reactive({});
    const modelReadinessDetails = reactive({}); // Stores { repos: [], files: [] } per model key
    const modelAvailabilityChecked = ref(false);
    const downloadingModelKey = ref(null);
    const autoFillPrompt = ref('');
    const isAutoFilling = ref(false);

    // Computed: Model requirements for selected skill
    const skillModelRequirements = computed(() => {
      if (!selectedSkillId.value) return [];
      return getSkillModelRequirements(selectedSkillId.value);
    });

    const missingModels = computed(() => {
      return skillModelRequirements.value.filter(model => !isModelReady(model));
    });

    const hasMissingModels = computed(() => {
      return missingModels.value.length > 0;
    });

    // Check if a model is ready/available
    const isModelReady = (model) => {
      // For LLM models, check file availability - default to NOT available until checked
      if (model.type === 'llm') {
        if (!modelAvailabilityChecked.value) return false;
        return modelAvailability[model.filename] === true;
      }
      // For Flask models (diffusion/audio/video/3d), check if Flask reported them as ready
      if (model.type === 'diffusion' || model.type === 'audio' || model.type === 'video' || model.type === '3d') {
        if (!modelAvailabilityChecked.value) return false;
        // If we checked and it's marked available, it's ready
        // If we checked and it's not in the map, assume it needs download
        return modelAvailability[model.key] === true;
      }
      return true;
    };

    // Check model availability on mount and when skill changes
    const checkModelAvailability = async () => {
      console.log('[SmartAgent] Checking model availability...');

      // Check LLM models via electron API (check each model individually)
      if (window.electronAPI?.checkModel) {
        // Check all LLM models defined in MODEL_REQUIREMENTS
        const llmModelKeys = ['llm_default', 'llm_hermes', 'llm_mythomax'];

        for (const key of llmModelKeys) {
          const model = MODEL_REQUIREMENTS[key];
          if (model?.filename) {
            try {
              const exists = await window.electronAPI.checkModel(model.filename);
              modelAvailability[model.filename] = exists;
              console.log(`[SmartAgent] LLM model ${model.filename}: ${exists ? 'available' : 'not found'}`);
            } catch (e) {
              console.warn(`[SmartAgent] Failed to check model ${model.filename}:`, e);
              modelAvailability[model.filename] = false;
            }
          }
        }
      }

      // Check Flask server readiness for diffusion/audio/video models via /pipelines/plan
      const port = window.BONZAI_SERVER_PORT || 65000;

      // Pipeline mappings: model key -> pipeline name (keys match MODEL_REQUIREMENTS)
      const pipelineMap = {
        'image_standard': 'image_standard',
        'image_turbo': 'image_turbo',
        'image_quality': 'image_quality',
        'image_advanced': 'image_advanced',
        'audio': 'audio',
        'video_fast': 'video_fast',
        'vision': 'qwen3_vision',
        // 'trellis_3d': '3d', // Not defined in Flask yet
      };

      // Check each pipeline in parallel
      const pipelineChecks = Object.entries(pipelineMap).map(async ([modelKey, pipeline]) => {
        try {
          const response = await fetch(`http://localhost:${port}/pipelines/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pipeline }),
          });
          if (response.ok) {
            const data = await response.json();
            console.log(`[SmartAgent] Pipeline ${pipeline} plan:`, data);

            // Use the top-level ok field from the server response
            if (data.ok === true) {
              modelAvailability[modelKey] = true;
              modelReadinessDetails[modelKey] = { repos: [], files: [] };
              console.log(`[SmartAgent] Model ${modelKey} is ready`);
            } else {
              modelAvailability[modelKey] = false;
              // Store missing repos and files for display
              const missingRepos = (data.repos || [])
                .filter(r => r.ok === false || (Number.isFinite(r.missing) && r.missing > 0))
                .map(r => r.repo);
              const missingFiles = (data.required_files || [])
                .filter(f => !f.ok || !f.exists)
                .map(f => (f.path || f.name || '').split('/').pop());
              modelReadinessDetails[modelKey] = { repos: missingRepos, files: missingFiles };
              console.log(`[SmartAgent] Model ${modelKey} needs download:`, modelReadinessDetails[modelKey]);
            }
          }
        } catch (e) {
          console.warn(`[SmartAgent] Failed to check pipeline ${pipeline}:`, e.message);
          // If Flask isn't running, don't mark as available
          modelAvailability[modelKey] = false;
          modelReadinessDetails[modelKey] = { repos: [], files: [], error: e.message };
        }
      });

      await Promise.all(pipelineChecks);

      modelAvailabilityChecked.value = true;
    };

    const getModelTypeIcon = (type) => {
      const icons = {
        llm: 'psychology',
        diffusion: 'image',
        audio: 'headphones',
        video: 'movie',
        '3d': '3d_rotation',
      };
      return icons[type] || 'deployed_code';
    };

    // Download a skill model
    const downloadSkillModel = async (model) => {
      if (downloadingModelKey.value) return;

      downloadingModelKey.value = model.key;
      downloadProgress.value = 0;

      try {
        if (model.type === 'llm' && model.url) {
          // Download LLM model via electron API
          if (window.electronAPI?.downloadModel) {
            showNotification(`Downloading ${model.name}...`, 'info', 0);

            // Set up progress listener
            const progressHandler = (e, data) => {
              if (data.filename === model.filename) {
                downloadProgress.value = Math.round(data.percent * 100);
              }
            };
            window.electronAPI.onDownloadProgress(progressHandler);

            // Download without callback (IPC can't clone functions)
            const success = await window.electronAPI.downloadModel(model.url, model.filename);

            if (success) {
              // Mark as available immediately
              modelAvailability[model.filename] = true;
              console.log(`[SmartAgent] Model downloaded, marking ${model.filename} as available`);

              // Also re-check all models to ensure consistency
              await checkModelAvailability();

              showNotification(`${model.name} downloaded successfully!`, 'success');
            } else {
              showNotification(`Failed to download ${model.name}`, 'danger');
            }
          } else {
            showNotification('Download API not available', 'warning');
          }
        } else if (model.type === 'diffusion' || model.type === 'audio' || model.type === 'video' || model.type === '3d') {
          // For Flask models, trigger prefetch via /pipelines/prefetch endpoint
          const port = window.BONZAI_SERVER_PORT || 65000;
          // Model keys now match pipeline names (e.g., image_standard, audio, video_fast)
          const pipeline = model.pipeline || model.key;
          if (pipeline) {
            showNotification(`Downloading ${model.name}...`, 'info');
            try {
              const response = await fetch(`http://localhost:${port}/pipelines/prefetch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pipeline }),
              });
              if (response.ok || response.status === 202) {
                modelAvailability[model.key] = true;
                showNotification(`${model.name} downloaded successfully!`, 'success');
              } else {
                showNotification(`${model.name} will download on first use`, 'info');
                modelAvailability[model.key] = true;
              }
            } catch (e) {
              // Flask not running, mark as ready anyway (will download on use)
              modelAvailability[model.key] = true;
              showNotification(`${model.name} will download on first use`, 'info');
            }
          } else {
            modelAvailability[model.key] = true;
          }
        } else {
          modelAvailability[model.key] = true;
          showNotification(`${model.name} ready`, 'success');
        }
      } catch (e) {
        showNotification(`Failed to download ${model.name}: ${e.message}`, 'danger');
      } finally {
        downloadingModelKey.value = null;
        downloadProgress.value = 0;
      }
    };

    // Download all missing models
    const downloadAllMissingModels = async () => {
      const missing = missingModels.value;
      if (missing.length === 0) return;

      for (const model of missing) {
        await downloadSkillModel(model);
      }

      // Re-check availability after downloads
      await checkModelAvailability();
    };

    // Auto-fill skill inputs using LLM
    const autoFillSkillInputs = async () => {
      if (!autoFillPrompt.value || isAutoFilling.value || !selectedSkill.value) return;

      isAutoFilling.value = true;

      try {
        // Build schema for LLM
        const inputSchema = Object.entries(selectedSkill.value.inputs)
          .filter(([key, field]) => !['image', 'object'].includes(field.type))
          .map(([key, field]) => {
            let schema = `- "${key}": ${field.label || key}`;
            if (field.type === 'select') {
              schema += ` (options: ${field.options.join(', ')})`;
            } else if (field.type === 'number') {
              schema += ` (number${field.min !== undefined ? `, min: ${field.min}` : ''}${field.max !== undefined ? `, max: ${field.max}` : ''})`;
            }
            if (field.description) {
              schema += ` - ${field.description}`;
            }
            return schema;
          }).join('\n');

        const prompt = `Based on this user request: "${autoFillPrompt.value}"

Fill in the following fields for the "${selectedSkill.value.name}" skill:
${inputSchema}

Output ONLY valid JSON with the field names as keys. Example:
{"fieldName": "value", "anotherField": "value"}

Return ONLY the JSON, no explanation.`;

        if (window.electronAPI?.chat) {
          const response = await window.electronAPI.chat(prompt);

          // Extract JSON from response
          let json;
          try {
            const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                             response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              json = JSON.parse(jsonMatch[1] || jsonMatch[0]);
            } else {
              json = JSON.parse(response);
            }

            // Apply generated values
            Object.entries(json).forEach(([key, value]) => {
              if (skillInputs.hasOwnProperty(key) || selectedSkill.value.inputs[key]) {
                skillInputs[key] = value;
              }
            });

            showNotification('Inputs auto-filled successfully!', 'success');
          } catch (e) {
            console.warn('[SmartAgent] Failed to parse auto-fill response:', e);
            showNotification('Could not parse AI response', 'warning');
          }
        }
      } catch (e) {
        console.error('[SmartAgent] Auto-fill error:', e);
        showNotification(`Auto-fill failed: ${e.message}`, 'danger');
      } finally {
        isAutoFilling.value = false;
      }
    };

    // Handle roleplay fee charges
    const handleRoleplayFee = (fee) => {
      console.log(`[SmartAgent] Roleplay fee charged: ${fee} BONZAI`);
      // TODO: Implement actual fee deduction
    };

    // Polymarket state
    const polymarketTimePeriod = ref("WEEK");
    const polymarketMinConviction = ref(2);
    const analysisHistory = ref([]);
    const investmentTheses = ref({});

    // TCG state
    const tcgCollections = ref([
      { id: 'pokemon', name: 'Pokemon', icon: 'amp_stories' },
      { id: 'mtg', name: 'Magic: The Gathering', icon: 'amp_stories' },
      { id: 'yugioh', name: 'Yu-Gi-Oh!', icon: 'amp_stories' },
      { id: 'onepiece', name: 'One Piece', icon: 'amp_stories' },
      { id: 'lorcana', name: 'Lorcana', icon: 'amp_stories' },
    ]);
    const selectedTcgCollection = ref("pokemon");
    const tcgTopCards = ref([]);
    const tcgSearchQuery = ref("");
    const tcgSearchResults = ref([]);
    const userTcgPortfolio = ref([]);
    const tcgMarkets = ref([]);
    const isTcgLoading = ref(false);
    const tcgMarketModal = reactive({
      show: false,
      card: null,
      operator: ">",
      targetPrice: null,
      targetDate: "",
      dataSources: [],
    });

    // DSLA state
    const dslaUseCases = [
      { key: "vol_returns", label: "Volatility of Returns", context: "DeFi yields, staking rewards, lending rates" },
      { key: "vol_availability", label: "Volatility of Availability", context: "blockchain uptime, API availability, node reliability" },
      { key: "vol_asset_floors", label: "Volatility of Asset Floors", context: "NFT floor prices, token minimums, collateral ratios" },
      { key: "vol_currency_pegs", label: "Volatility of Currency Pegs", context: "stablecoin pegs, wrapped token ratios, synthetic assets" },
      { key: "vol_response_time", label: "Volatility of Response Time", context: "block times, transaction confirmations, oracle updates" },
      { key: "vol_delivery_time", label: "Volatility of Delivery Time", context: "NFT mints, token distributions, airdrop claims" },
    ];
    const selectedUseCase = ref(null);
    const projectForm = reactive({
      name: "",
      tokenSymbol: "",
      description: "",
      totalSupply: "",
      price: 0.1, // ETH
    });

    // Token issuance modal state
    const tokenIssuanceModal = reactive({
      show: false,
      skill: null,
      tokenName: "",
      tokenSymbol: "",
      totalSupply: "1000000000",
      initialLiquidityTokens: "100000000", // 10% of supply
      initialLiquidityEth: "0.5",
      startingPriceEth: "0.0000001",
      initialLiquidityDsla: "",
      isIssuing: false,
      progress: { step: 0, total: 0, message: "" },
    });
    const dslaEthPrice = computed(() => tokenService.state.dslaEthPrice);
    const isFetchingDslaPrice = computed(() => tokenService.state.isFetchingPrice);

    // Positions
    const positions = ref({});
    const positionModal = reactive({
      show: false,
      protocol: null,
      marketIdx: null,
      side: null,
      market: null,
      amount: null,
    });

    // Skill creation form
    const skillForm = reactive({
      name: "",
      description: "",
      category: "prediction-market",
      price: 0.1,
      steps: [],
    });

    // Model config
    const modelConfig = {
      modelname: "LLaMA 3.1 8B",
      url: "https://huggingface.co/lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
      filename: "meta-llama-3.1-8b-instruct-q4_k_m.gguf",
    };

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

    // Polymarket categories (from polymarketAgent)
    const polymarketCategories = polymarketAgent.categories;
    const selectedPolymarketCategory = ref("OVERALL");

    // Computed from store
    const categories = computed(() => skillStore.categories);
    const selectedCategory = computed(() => skillStore.selectedCategory);
    const searchQuery = computed({
      get: () => skillStore.searchQuery,
      set: (val) => skillStore.setSearchQuery(val),
    });
    const filteredSkills = computed(() => skillStore.filteredSkills);
    const accessibleSkills = computed(() => skillStore.accessibleSkills);

    // Level-based access
    const canRunSkill = (skillId) => skillStore.canRunSkill(skillId);
    const getRequiredLevel = (skill) => skillStore.getRequiredLevel(skill);

    // Available skills - show accessible skills (user has required level)
    const availableSkills = computed(() => {
      return accessibleSkills.value;
    });

    // Methods
    const setCategory = (category) => {
      skillStore.setCategory(category);
    };

    const getCategoryLabel = (categoryKey) => {
      return SKILL_CATEGORY_META[categoryKey]?.label || categoryKey;
    };

    const getCategoryIcon = (categoryKey) => {
      return SKILL_CATEGORY_META[categoryKey]?.icon || 'extension';
    };

    const getCategoryColor = (categoryKey) => {
      const colorMap = {
        'entertainment': 'is-danger',
        'healthcare': 'is-success',
        'housing': 'is-info',
        'fashion': 'is-warning',
        'food': 'is-primary',
        'education': 'is-link',
        'reading': 'is-dark',
        'personal-care': 'is-light',
        'prediction-market': 'is-info',
        'analysis': 'is-success',
        'trading': 'is-warning',
      };
      return colorMap[categoryKey] || 'is-dark';
    };

    const formatOptionLabel = (opt) => {
      // Convert kebab-case or snake_case to Title Case
      return String(opt)
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    };

    const hasImageResults = (results) => {
      if (!results) return false;
      const str = JSON.stringify(results);
      return str.includes('image') || str.includes('Image') || str.includes('base64');
    };

    const extractImages = (results, path = '', images = []) => {
      if (!results) return images;

      for (const [key, value] of Object.entries(results)) {
        const currentPath = path ? `${path}.${key}` : key;

        if (typeof value === 'string' && value.length > 100 &&
            (key.toLowerCase().includes('image') || key.toLowerCase().includes('portrait') ||
             key.toLowerCase().includes('cover') || key.toLowerCase().includes('photo'))) {
          images.push({ label: formatOptionLabel(key), data: value });
        } else if (Array.isArray(value)) {
          value.forEach((item, idx) => {
            if (typeof item === 'object') {
              extractImages(item, `${currentPath}[${idx}]`, images);
            }
          });
        } else if (typeof value === 'object' && value !== null) {
          extractImages(value, currentPath, images);
        }
      }

      return images;
    };

    // Handle image file upload for skill inputs
    const handleImageUpload = (event, inputKey) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        // Extract base64 without the data:image prefix
        const base64 = e.target.result.split(',')[1];
        skillInputs[inputKey] = base64;
      };
      reader.readAsDataURL(file);
    };

    const showNotification = (message, type = "info", duration = 3000) => {
      statusNotification.value = { show: true, message, type };
      if (duration > 0) {
        setTimeout(() => {
          statusNotification.value.show = false;
        }, duration);
      }
    };

    const refreshSkills = async () => {
      await skillStore.initialize();
      showNotification("Skills refreshed!", "success");
    };

    const runSkill = (skill) => {
      // Check level access before running
      const access = canRunSkill(skill.id);
      if (!access.canRun) {
        showNotification(`${access.requiredLevel} required: ${access.reason}`, "warning");
        return;
      }
      selectSkillById(skill.id);
      activeTab.value = "my-skills";
    };

    const selectSkillById = (skillId) => {
      selectedSkillId.value = skillId;
      const skill = skillStore.getSkillById(skillId);
      if (skill) {
        Object.entries(skill.inputs || {}).forEach(([key, field]) => {
          skillInputs[key] = field.default;
        });

        // Auto-load data for specific skills
        if (skillId === 'tcg-prediction-market-v1.0.0') {
          loadTcgTopCards();
        }
      }
    };

    const executeSelectedSkill = async () => {
      if (!selectedSkill.value) return;

      isExecuting.value = true;
      executionStatus.value = "Starting...";

      try {
        const result = await skillStore.executeSkill(
          selectedSkill.value.id,
          { ...skillInputs }
        );

        if (result.success) {
          executionResults[selectedSkill.value.id] = result.result;
          showNotification("Skill executed successfully!", "success");
        } else {
          showNotification(`Execution failed: ${result.error}`, "danger");
        }
      } catch (e) {
        showNotification(`Error: ${e.message}`, "danger");
      } finally {
        isExecuting.value = false;
        executionStatus.value = "";
      }
    };

    // Polymarket methods
    const selectTimePeriodAndAnalyze = async (period) => {
      polymarketTimePeriod.value = period;
      await analyzePolymarket();
    };

    const selectConvictionAndAnalyze = async (level) => {
      polymarketMinConviction.value = level;
      await analyzePolymarket();
    };

    const selectCategoryAndAnalyze = async (category) => {
      selectedPolymarketCategory.value = category;
      await analyzePolymarket();
    };

    const analyzePolymarket = async () => {
      isAnalyzing.value = true;
      // Clear previous theses when running new analysis
      investmentTheses.value = {};
      const categoryLabel = polymarketCategories.find(c => c.key === selectedPolymarketCategory.value)?.label || 'All Markets';
      loadingMessage.value = `Fetching ${categoryLabel} leaderboard from Polymarket...`;

      try {
        // Use the polymarketAgent to fetch real data
        const results = await polymarketAgent.execute(
          {
            numTraders: 15, // Fetch more traders to find more positions
            timePeriod: polymarketTimePeriod.value,
            category: selectedPolymarketCategory.value,
            minConviction: polymarketMinConviction.value,
            copyFraction: 0.1,
          },
          {
            updateStatus: (status) => {
              loadingMessage.value = status;
            },
          }
        );

        // Store the analysis results (top 10 recommendations)
        analysisHistory.value = [{
          topTraders: results.topTraders || [],
          recommendations: (results.recommendations || []).slice(0, 10), // Top 10 high conviction positions
          meta: results.meta || {
            timePeriod: polymarketTimePeriod.value,
            category: selectedPolymarketCategory.value,
            minConviction: polymarketMinConviction.value,
            analyzedAt: new Date().toISOString(),
          },
        }];

        console.log('[SmartAgent] Polymarket analysis complete:', results);

        if (results.recommendations?.length === 0) {
          showNotification(`No high conviction positions found for ${categoryLabel}. Try lowering consensus threshold.`, "info");
        }
      } catch (e) {
        console.error('[SmartAgent] Polymarket analysis error:', e);
        analysisHistory.value = [{ error: e.message }];
        showNotification(`Analysis failed: ${e.message}`, "danger");
      } finally {
        isAnalyzing.value = false;
      }
    };

    const generateInvestmentThesis = async (analysisIdx, recIdx, rec) => {
      const key = `${analysisIdx}-${recIdx}`;
      investmentTheses.value[key] = { loading: true, thesis: null, error: null };

      try {
        await loadModel();

        const prompt = `Generate an investment thesis for the following prediction market:

Question: ${rec.question}
Current market probability: ${(rec.market.currentPrice * 100).toFixed(0)}%
Position: ${rec.outcome}
Conviction: ${rec.conviction.traderCount} top traders agree, total size $${formatNumber(rec.conviction.totalSize)}

Provide a concise analysis covering:
1. Why this position might be correct
2. Key risks to consider
3. Suggested position sizing`;

        const response = await window.electronAPI?.chat?.(prompt);

        if (!response) {
          throw new Error("No response from model. Please ensure the model is loaded.");
        }

        investmentTheses.value[key] = {
          loading: false,
          thesis: response,
          error: null,
        };
      } catch (e) {
        investmentTheses.value[key] = {
          loading: false,
          thesis: null,
          error: e.message,
        };
      }
    };

    const getThesis = (analysisIdx, recIdx) => {
      return investmentTheses.value[`${analysisIdx}-${recIdx}`];
    };

    const openPolymarket = (slug) => {
      if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(`https://polymarket.com/event/${slug}`);
      }
    };

    // TCG methods
    const loadTcgTopCards = async () => {
      isTcgLoading.value = true;
      tcgSearchResults.value = [];

      try {
        // Mock data for development
        const mockCards = {
          pokemon: [
            { id: 'p1', name: 'Charizard VMAX', set: "Champion's Path", rarity: 'Ultra Rare', price: 350, priceChange: 15 },
            { id: 'p2', name: 'Pikachu VMAX', set: 'Vivid Voltage', rarity: 'Ultra Rare', price: 180, priceChange: 8 },
            { id: 'p3', name: 'Umbreon VMAX', set: 'Evolving Skies', rarity: 'Alternate Art', price: 420, priceChange: -5 },
          ],
          mtg: [
            { id: 'm1', name: 'Black Lotus', set: 'Alpha', rarity: 'Rare', price: 150000, priceChange: 5 },
            { id: 'm2', name: 'Mox Sapphire', set: 'Beta', rarity: 'Rare', price: 8500, priceChange: -3 },
          ],
          yugioh: [
            { id: 'y1', name: 'Blue-Eyes White Dragon', set: 'LOB', rarity: '1st Edition', price: 2500, priceChange: 10 },
            { id: 'y2', name: 'Dark Magician', set: 'LOB', rarity: '1st Edition', price: 1200, priceChange: 5 },
          ],
          onepiece: [
            { id: 'o1', name: 'Monkey D. Luffy', set: 'OP01', rarity: 'Leader', price: 45, priceChange: 20 },
            { id: 'o2', name: 'Roronoa Zoro', set: 'OP01', rarity: 'Super Rare', price: 85, priceChange: 12 },
          ],
          lorcana: [
            { id: 'l1', name: 'Elsa, Snow Queen', set: 'The First Chapter', rarity: 'Enchanted', price: 450, priceChange: -10 },
            { id: 'l2', name: 'Mickey Mouse, True Friend', set: 'The First Chapter', rarity: 'Enchanted', price: 280, priceChange: 5 },
          ],
        };

        tcgTopCards.value = mockCards[selectedTcgCollection.value] || [];
      } catch (e) {
        console.error('[SmartAgent] TCG load error:', e);
      } finally {
        isTcgLoading.value = false;
      }
    };

    const searchTcgCards = async () => {
      if (!tcgSearchQuery.value) {
        tcgSearchResults.value = [];
        return;
      }

      isTcgLoading.value = true;

      try {
        // Mock search
        const query = tcgSearchQuery.value.toLowerCase();
        tcgSearchResults.value = tcgTopCards.value.filter(
          c => c.name.toLowerCase().includes(query)
        );
      } catch (e) {
        console.error('[SmartAgent] TCG search error:', e);
      } finally {
        isTcgLoading.value = false;
      }
    };

    const addToPortfolio = (card) => {
      if (!userTcgPortfolio.value.some(c => c.id === card.id)) {
        userTcgPortfolio.value.push({
          ...card,
          collection: selectedTcgCollection.value,
        });
      }
    };

    const removeFromPortfolio = (cardId) => {
      userTcgPortfolio.value = userTcgPortfolio.value.filter(c => c.id !== cardId);
    };

    const openTcgMarketModal = (card) => {
      tcgMarketModal.show = true;
      tcgMarketModal.card = card;
      tcgMarketModal.operator = ">";
      tcgMarketModal.targetPrice = Math.round(card.price * 1.2);
      tcgMarketModal.targetDate = "";
      // Initialize with default data source for TCG pricing
      tcgMarketModal.dataSources = [
        {
          name: "TCGPlayer",
          endpoint: `https://api.tcgplayer.com/pricing/product/${card.id}`,
          description: "Primary market price data",
        },
      ];
    };

    const closeTcgMarketModal = () => {
      tcgMarketModal.show = false;
      tcgMarketModal.card = null;
      tcgMarketModal.dataSources = [];
    };

    const addDataSource = () => {
      tcgMarketModal.dataSources.push({
        name: "",
        endpoint: "",
        description: "",
      });
    };

    const removeDataSource = (idx) => {
      tcgMarketModal.dataSources.splice(idx, 1);
    };

    const createTcgMarket = () => {
      if (!tcgMarketModal.targetPrice || !tcgMarketModal.targetDate) return;

      // Validate at least one data source
      const validSources = tcgMarketModal.dataSources.filter(s => s.name && s.endpoint);
      if (validSources.length === 0) {
        showNotification("Please add at least one data source with name and endpoint", "warning");
        return;
      }

      const operatorText = {
        ">": "exceed",
        "<": "fall below",
        ">=": "reach at least",
        "<=": "stay at or below",
        "=": "equal exactly",
      };

      const market = {
        id: `tcg-${Date.now()}`,
        cardId: tcgMarketModal.card.id,
        cardName: tcgMarketModal.card.name,
        question: `Will ${tcgMarketModal.card.name}'s market price ${operatorText[tcgMarketModal.operator]} $${tcgMarketModal.targetPrice} by ${tcgMarketModal.targetDate}?`,
        operator: tcgMarketModal.operator,
        targetPrice: tcgMarketModal.targetPrice,
        targetDate: tcgMarketModal.targetDate,
        dataSources: validSources.map(s => ({ ...s })),
        createdAt: new Date().toISOString(),
      };

      tcgMarkets.value.push(market);
      closeTcgMarketModal();
      showNotification("Market created successfully!", "success");
    };

    // DSLA methods
    const selectUseCaseAndGenerate = (useCase) => {
      selectedUseCase.value = useCase;
      showNotification(`Selected: ${useCase.label}`, "info");
    };

    const createPredictionMarketSkill = async () => {
      if (!projectForm.name || !projectForm.tokenSymbol || !selectedUseCase.value) {
        showNotification("Please fill in all required fields and select a use case", "warning");
        return;
      }

      showNotification("Creating prediction market skill...", "info", 0);

      const result = await skillStore.publishSkill({
        name: projectForm.name,
        description: projectForm.description || `${selectedUseCase.value.label} prediction market for ${projectForm.tokenSymbol}`,
        category: "prediction-market",
        price: projectForm.price || 0.1,
        useCase: selectedUseCase.value.key,
        tokenSymbol: projectForm.tokenSymbol,
        totalSupply: projectForm.totalSupply,
        steps: [
          {
            type: "data-fetch",
            mode: "scheduled",
            prompt: `Fetch ${selectedUseCase.value.context} data for ${projectForm.tokenSymbol}`,
          },
          {
            type: "analysis",
            mode: "on-demand",
            prompt: `Analyze ${selectedUseCase.value.label} metrics and generate market predictions`,
          },
        ],
      });

      if (result.success) {
        showNotification(`Skill "${projectForm.name}" created successfully!`, "success");

        // Reset form
        projectForm.name = "";
        projectForm.tokenSymbol = "";
        projectForm.description = "";
        projectForm.totalSupply = "";
        projectForm.price = 0.1;
        selectedUseCase.value = null;

        // Switch to browse tab
        activeTab.value = "browse";
        await skillStore.initialize();
      } else {
        showNotification(`Failed to create skill: ${result.error}`, "danger");
      }
    };

    // Position methods
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
      const side = positionModal.side;

      if (!positions.value[key]) {
        positions.value[key] = { for: null, against: null };
      }

      positions.value[key][side] = {
        amount: positionModal.amount,
        side,
        timestamp: new Date().toISOString(),
      };

      showNotification(`Position opened: ${positionModal.amount} tokens ${side === 'for' ? 'FOR' : 'AGAINST'}`, "success");
      closePositionModal();
    };

    // Skill creation methods
    const addStep = () => {
      skillForm.steps.push({
        type: "script",
        mode: "one-pass",
        reasoning: "offline",
        prompt: "",
      });
    };

    const removeStep = (idx) => {
      skillForm.steps.splice(idx, 1);
    };

    const publishSkill = async () => {
      if (!skillForm.name || !skillForm.description || skillForm.steps.length === 0) {
        showNotification("Please fill in all required fields", "warning");
        return;
      }

      showNotification("Publishing skill...", "info", 0);

      const result = await skillStore.publishSkill({
        name: skillForm.name,
        description: skillForm.description,
        category: skillForm.category,
        price: skillForm.price,
        steps: skillForm.steps,
      });

      if (result.success) {
        showNotification(`Skill "${skillForm.name}" published successfully!`, "success");

        // Reset form
        skillForm.name = "";
        skillForm.description = "";
        skillForm.category = "prediction-market";
        skillForm.price = 0.1;
        skillForm.steps = [];

        // Switch to browse tab
        activeTab.value = "browse";
      } else {
        showNotification(`Failed to publish: ${result.error}`, "danger");
      }
    };

    // Token issuance methods
    const openTokenIssuanceModal = async (skill) => {
      tokenIssuanceModal.show = true;
      tokenIssuanceModal.skill = skill;
      tokenIssuanceModal.tokenName = skill.tokenSymbol ? `${skill.name} Token` : skill.name;
      tokenIssuanceModal.tokenSymbol = skill.tokenSymbol || skill.name.substring(0, 4).toUpperCase();
      tokenIssuanceModal.totalSupply = skill.totalSupply || "1000000000";
      tokenIssuanceModal.initialLiquidityTokens = String(Math.floor(Number(tokenIssuanceModal.totalSupply) * 0.1));
      tokenIssuanceModal.initialLiquidityEth = "0.5";
      tokenIssuanceModal.startingPriceEth = "0.0000001";
      tokenIssuanceModal.initialLiquidityDsla = "";
      tokenIssuanceModal.isIssuing = false;
      tokenIssuanceModal.progress = { step: 0, total: 0, message: "" };

      // Fetch DSLA price if this is a DSLA skill
      if (isDslaSkill(skill)) {
        await tokenService.fetchDslaEthPrice();
        // Calculate suggested DSLA liquidity based on ETH liquidity
        if (dslaEthPrice.value) {
          const ethAmount = parseFloat(tokenIssuanceModal.initialLiquidityEth) || 0;
          const dslaAmount = tokenService.ethToDsla(ethAmount);
          tokenIssuanceModal.initialLiquidityDsla = String(Math.floor(dslaAmount));
        }
      }
    };

    const closeTokenIssuanceModal = () => {
      tokenIssuanceModal.show = false;
      tokenIssuanceModal.skill = null;
    };

    const isDslaSkill = (skill) => {
      return skill?.category === 'prediction-market' || skill?.useCase;
    };

    const hasIssuedToken = (skillId) => {
      return tokenService.hasIssuedToken(skillId);
    };

    const getSkillTokenData = (skillId) => {
      return tokenService.getTokenData(skillId);
    };

    const calculateDslaFromEth = () => {
      if (dslaEthPrice.value) {
        const ethAmount = parseFloat(tokenIssuanceModal.initialLiquidityEth) || 0;
        const dslaAmount = tokenService.ethToDsla(ethAmount);
        tokenIssuanceModal.initialLiquidityDsla = String(Math.floor(dslaAmount));
      }
    };

    const issueToken = async () => {
      const skill = tokenIssuanceModal.skill;
      if (!skill) return;

      tokenIssuanceModal.isIssuing = true;

      try {
        const isDsla = isDslaSkill(skill);
        const result = await tokenService.issueSkillToken({
          skillId: skill.id,
          name: tokenIssuanceModal.tokenName,
          symbol: tokenIssuanceModal.tokenSymbol,
          totalSupply: tokenIssuanceModal.totalSupply,
          initialLiquidityTokens: tokenIssuanceModal.initialLiquidityTokens,
          initialLiquidityEth: tokenIssuanceModal.initialLiquidityEth,
          startingPriceEth: parseFloat(tokenIssuanceModal.startingPriceEth),
          isDslaSkill: isDsla,
          initialLiquidityDsla: isDsla ? tokenIssuanceModal.initialLiquidityDsla : null,
          onProgress: (progress) => {
            tokenIssuanceModal.progress = progress;
          },
        });

        if (result.success) {
          showNotification(
            `Token ${tokenIssuanceModal.tokenSymbol} issued successfully! Pool created on Uniswap.`,
            "success"
          );
          closeTokenIssuanceModal();
        } else {
          showNotification(`Token issuance failed: ${result.error}`, "danger");
        }
      } catch (e) {
        showNotification(`Token issuance failed: ${e.message}`, "danger");
      } finally {
        tokenIssuanceModal.isIssuing = false;
      }
    };

    // Model methods (legacy - for Polymarket default model)
    const checkPolymarketModelAvailability = async () => {
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

      const removeListener = window.electronAPI.onDownloadProgress?.(
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
          showNotification("Model downloaded successfully!", "success");
        }
      } catch (err) {
        showNotification(`Download failed: ${err.message}`, "danger");
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

      await window.electronAPI?.loadModel?.(payload);
      isModelLoaded.value = true;
    };

    const formatNumber = (num) => {
      if (!num) return "0";
      const n = Number(num);
      if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
      if (n >= 1000) return (n / 1000).toFixed(1) + "K";
      return n.toFixed(2);
    };

    // Lifecycle
    onMounted(async () => {
      await skillStore.initialize();
      await checkModelAvailability();
      await checkPolymarketModelAvailability(); // Legacy check for Polymarket default model
      tokenService.initialize();
    });

    // Watch for store status updates
    watch(
      () => skillStore.runningStatus,
      (status) => {
        if (status) {
          executionStatus.value = status;
        }
      }
    );

    // Watch for skill changes to refresh model availability
    watch(selectedSkillId, async (newSkillId) => {
      if (newSkillId) {
        console.log('[SmartAgent] Skill changed to:', newSkillId);
        // Re-check model availability when skill changes
        await checkModelAvailability();
      }
    });

    return {
      // Tab
      activeTab,

      // Notifications
      statusNotification,
      showNotification,

      // Categories & Filtering
      categories,
      selectedCategory,
      setCategory,
      searchQuery,
      filteredSkills,
      getCategoryLabel,
      getCategoryIcon,
      getCategoryColor,
      formatOptionLabel,
      hasImageResults,
      extractImages,
      handleImageUpload,

      // Skills
      accessibleSkills,
      canRunSkill,
      getRequiredLevel,
      refreshSkills,
      runSkill,
      availableSkills,

      // Skill execution
      selectedSkillId,
      selectedSkill,
      selectSkillById,
      skillInputs,
      isExecuting,
      executionStatus,
      executionResults,
      executeSelectedSkill,

      // Model requirements
      skillModelRequirements,
      missingModels,
      hasMissingModels,
      modelAvailability,
      modelReadinessDetails,
      modelAvailabilityChecked,
      downloadingModelKey,
      isModelReady,
      getModelTypeIcon,
      downloadSkillModel,
      checkModelAvailability,
      downloadAllMissingModels,

      // Auto-fill
      autoFillPrompt,
      isAutoFilling,
      autoFillSkillInputs,

      // Roleplay
      handleRoleplayFee,

      // Polymarket
      polymarketPeriods,
      polymarketConvictionLevels,
      polymarketCategories,
      polymarketTimePeriod,
      polymarketMinConviction,
      selectedPolymarketCategory,
      selectTimePeriodAndAnalyze,
      selectConvictionAndAnalyze,
      selectCategoryAndAnalyze,
      analysisHistory,
      investmentTheses,
      generateInvestmentThesis,
      getThesis,
      openPolymarket,
      formatNumber,

      // TCG
      tcgCollections,
      selectedTcgCollection,
      tcgTopCards,
      tcgSearchQuery,
      tcgSearchResults,
      userTcgPortfolio,
      tcgMarkets,
      isTcgLoading,
      tcgMarketModal,
      loadTcgTopCards,
      searchTcgCards,
      addToPortfolio,
      removeFromPortfolio,
      openTcgMarketModal,
      closeTcgMarketModal,
      createTcgMarket,
      addDataSource,
      removeDataSource,

      // DSLA Skill Factory
      dslaUseCases,
      selectedUseCase,
      projectForm,
      selectUseCaseAndGenerate,
      createPredictionMarketSkill,

      // Positions
      positions,
      positionModal,
      getPosition,
      hasPosition,
      openPositionModal,
      closePositionModal,
      confirmPosition,

      // Model
      isModelAvailable,
      isDownloading,
      downloadProgress,
      downloadModel,
      isAnalyzing,
      isGenerating,
      loadingMessage,

      // Skill creation
      skillForm,
      addStep,
      removeStep,
      publishSkill,

      // Token issuance
      tokenIssuanceModal,
      dslaEthPrice,
      isFetchingDslaPrice,
      openTokenIssuanceModal,
      closeTokenIssuanceModal,
      isDslaSkill,
      hasIssuedToken,
      getSkillTokenData,
      calculateDslaFromEth,
      issueToken,
    };
  },
};
</script>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");

.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 100, "GRAD" -25, "opsz" 48;
  border-radius: 100%;
}

.rotating {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
  padding: 2em;
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
  background-color: rgba(255, 255, 255, 0.1);
}

h1 {
  margin-top: 0 !important;
  font-size: 64px;
  color: #fff;
  text-align: left;
}

p {
  font-size: 16px;
  color: #fff;
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
}

.status-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  padding: 1em 1.5em;
  border-radius: 8px;
  display: flex;
  align-items: center;
  color: #fff;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.status-notification.is-success {
  background: rgba(57, 213, 130, 0.95);
}

.status-notification.is-danger {
  background: rgba(255, 56, 96, 0.95);
}

.status-notification.is-info {
  background: rgba(62, 142, 208, 0.95);
}

.status-notification.is-warning {
  background: rgba(255, 193, 7, 0.95);
  color: #000;
}

/* Notification slide animation */
.notification-slide-enter-active {
  animation: notification-fade-slide-in 0.4s ease-out;
}

.notification-slide-leave-active {
  animation: notification-fade-slide-out 0.4s ease-in;
}

@keyframes notification-fade-slide-in {
  0% {
    opacity: 0;
    transform: translateX(100px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes notification-fade-slide-out {
  0% {
    opacity: 1;
    transform: translateX(0);
  }
  100% {
    opacity: 0;
    transform: translateX(100px);
  }
}

/* Category filter */
.category-filter {
  overflow-x: auto;
  white-space: nowrap;
}

.category-selector {
  display: flex;
  gap: 0.5em;
}

.category-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.7);
  transition: all 0.2s ease;
}

.category-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.category-btn.is-active {
  background: rgba(62, 142, 208, 0.5);
  border-color: #3e8ed0;
  color: #fff;
}

/* Skills grid */
.skills-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 1.5em;
}

.skill-card {
  transition: all 0.2s ease;
}

.skill-card:hover {
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.skill-card.is-owned {
  border-color: rgba(57, 213, 130, 0.5);
}

.skill-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5em;
}

.skill-name {
  font-size: 1.5rem;
  color: #fff;
  margin: 0;
}

.skill-description {
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 0.5em;
}

.skill-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.skill-inputs .field {
  margin-bottom: 1em;
}

.skill-inputs .label {
  font-size: 0.9rem;
}

.execution-results {
  max-height: none;
  overflow-y: visible;
}

.execution-results pre {
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Visual Skill Input Selectors */
.visual-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
}

.visual-selector input[type="radio"] {
  display: none;
}

.visual-selector .radio {
  padding: 0.75em 1.25em;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 600;
  text-transform: capitalize;
}

.visual-selector .radio:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  transform: translateY(-1px);
}

.visual-selector input[type="radio"]:checked + .radio {
  background: linear-gradient(135deg, rgba(62, 142, 208, 0.6), rgba(102, 126, 234, 0.6));
  border-color: #3e8ed0;
  color: #fff;
  box-shadow: 0 2px 8px rgba(62, 142, 208, 0.3);
}

/* Toggle Switch */
.switch {
  position: relative;
  display: inline-block;
  width: 60px;
  height: 34px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.2);
  transition: 0.3s;
  border-radius: 34px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 26px;
  width: 26px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

input:checked + .slider {
  background: linear-gradient(135deg, #48c78e, #3e8ed0);
}

input:checked + .slider:before {
  transform: translateX(26px);
}

/* Number Input Group */
.number-input-group .button {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.number-input-group .button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.number-input-group .input {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 1.25rem;
  font-weight: bold;
}

/* Generated Image Display */
.generated-image {
  width: 100%;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.generated-image-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 0.75rem;
  transition: transform 0.2s ease;
}

.generated-image-card:hover {
  transform: scale(1.02);
}

/* Scene Cards */
.scene-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 1.5rem;
  border-left: 4px solid #3e8ed0;
}

/* Recipe Results */
.recipe-result .tags {
  margin-bottom: 1rem;
}

/* Skill Header Banner */
.skill-header-banner {
  padding: 1.5rem;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Input Sections */
.input-section {
  padding: 1rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.input-section:last-child {
  border-bottom: none;
}

/* Results Container */
.results-container {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Image Gallery */
.image-gallery .column {
  padding: 0.5rem;
}

/* Image Upload Area */
.image-upload-area .preview-image {
  max-width: 200px;
  max-height: 200px;
  border-radius: 8px;
  object-fit: cover;
}

.image-upload-area .file-cta {
  background: rgba(255, 255, 255, 0.1);
  border: 2px dashed rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.7);
  padding: 2rem;
  transition: all 0.2s ease;
}

.image-upload-area .file-cta:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.5);
  color: #fff;
}

.image-upload-area .file-icon {
  margin-right: 0.5rem;
}

.image-upload-area .file-icon .material-symbols-outlined {
  font-size: 24px;
}

/* Agent selector */
.agent-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
}

.agent-selector input[type="radio"] {
  display: none;
}

.agent-selector .radio {
  padding: 0.75em 1.5em;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 700;
}

.agent-selector .radio:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.agent-selector input[type="radio"]:checked + .radio {
  background: rgba(62, 142, 208, 0.5);
  border-color: #3e8ed0;
  color: #fff;
}

/* Time period and conviction selectors */
.timeperiod-selector,
.conviction-selector,
.usecase-selector,
.collection-selector,
.polymarket-category {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
}

.timeperiod-selector input[type="radio"],
.conviction-selector input[type="radio"],
.usecase-selector input[type="radio"],
.collection-selector input[type="radio"],
.polymarket-category input[type="radio"] {
  display: none;
}

.timeperiod-selector .radio,
.conviction-selector .radio,
.usecase-selector .radio,
.collection-selector .radio,
.polymarket-category .radio {
  padding: 0.5em 1em;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 700;
}

.timeperiod-selector .radio:hover,
.conviction-selector .radio:hover,
.usecase-selector .radio:hover,
.collection-selector .radio:hover,
.polymarket-category .radio:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.timeperiod-selector input[type="radio"]:checked + .radio,
.conviction-selector input[type="radio"]:checked + .radio,
.usecase-selector input[type="radio"]:checked + .radio,
.collection-selector input[type="radio"]:checked + .radio,
.polymarket-category input[type="radio"]:checked + .radio {
  background: rgba(62, 142, 208, 0.5);
  border-color: #3e8ed0;
  color: #fff;
}

/* Market card */
.market-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 1.5em;
}

.market-question {
  display: flex;
  align-items: flex-start;
}

/* TCG styles */
.tcg-section {
  min-height: 300px;
}

.tcg-cards {
  max-height: 400px;
  overflow-y: auto;
}

.tcg-card-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75em;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  margin-bottom: 0.5em;
}

.tcg-card-info strong {
  color: #fff;
}

.tcg-portfolio-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  padding: 1em;
  margin-bottom: 0.5em;
}

.portfolio-card-header strong {
  color: #fff;
}

/* SLA market card */
.sla-market-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 1em;
}

.sla-market-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sla-preview {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}

/* Workflow builder */
.workflow-step {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Loading overlay */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
}

.loading-content {
  text-align: center;
  color: #fff;
}

/* Modal styles */
.position-modal-overlay,
.tcg-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.position-modal,
.tcg-modal {
  background: rgba(30, 30, 30, 0.95);
  border-radius: 12px;
  padding: 2em;
  max-width: 500px;
  width: 90%;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.token-modal {
  max-width: 600px;
}

.modal-divider {
  border-color: rgba(255, 255, 255, 0.1);
  margin: 1.5em 0;
}

.token-issuance-section {
  padding: 1em;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
}

.dsla-pool-section {
  background: rgba(62, 142, 208, 0.1);
  border-radius: 8px;
  padding: 1em;
  border: 1px solid rgba(62, 142, 208, 0.3);
}

.dsla-price-info {
  padding: 0.5em;
}

.issuance-progress .notification {
  margin-bottom: 0;
}

.position-modal.is-for {
  border-color: rgba(57, 213, 130, 0.5);
}

.position-modal.is-against {
  border-color: rgba(255, 56, 96, 0.5);
}

.position-modal-header,
.tcg-modal-header {
  margin-bottom: 1.5em;
}

.position-modal-header .material-symbols-outlined,
.tcg-modal-header .material-symbols-outlined {
  font-size: 48px;
  color: #fff;
}

.position-market-preview,
.tcg-card-preview {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 1em;
  margin-bottom: 1em;
}

.position-status-pill,
.tcg-status-pill {
  background: rgba(62, 142, 208, 0.3);
  padding: 0.5em 1em;
  border-radius: 20px;
  color: #fff;
}

.position-question {
  color: #fff;
  font-size: 1.1em;
}

.position-field,
.tcg-field {
  margin-bottom: 1em;
}

.position-label,
.tcg-label {
  color: #fff;
  display: block;
  margin-bottom: 0.5em;
}

.position-input,
.tcg-input,
.tcg-select {
  width: 100%;
  padding: 0.75em;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #fff;
  font-size: 1em;
}

.tcg-input.is-small {
  padding: 0.5em;
  font-size: 0.9em;
}

.data-source-item {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 0.75em;
}

.data-source-item .columns {
  margin-bottom: 0.5em;
}

.position-preview-box,
.tcg-preview-box {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 1em;
  margin: 1em 0;
}

.position-preview-text,
.tcg-preview-text {
  color: rgba(255, 255, 255, 0.8);
}

.position-modal-footer,
.tcg-modal-footer {
  display: flex;
  gap: 1em;
  justify-content: center;
  margin-top: 1.5em;
}

.position-primary-btn,
.tcg-primary-btn {
  background: linear-gradient(135deg, #39d582 0%, #2ecc71 100%);
  border: none;
  color: #fff;
}

/* Inputs */
.input,
.textarea,
.select select {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: 200ms ease-in;
}

.input:focus,
.textarea:focus,
.select select:focus {
  border-color: #3e8ed0;
  box-shadow: 0 0 0 2px rgba(62, 142, 208, 0.25);
}

.no-shadow {
  box-shadow: none !important;
}

::placeholder {
  color: rgba(255, 255, 255, 0.3) !important;
}

.filesize {
  padding: 5px 10px;
  font-size: 14px;
  color: rgba(255, 255, 255, 1);
  background: rgba(255, 255, 255, 0.25);
  border-radius: 4px;
}

/* Investment thesis */
.investment-thesis {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 1.5em;
}

.thesis-header {
  color: #3e8ed0;
  margin-bottom: 1em;
}

.thesis-content {
  line-height: 1.6;
}
</style>
