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
                Agentic Skills
              </h1>
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
                    start
                  </span>
                  Run
                </a>
              </li>
            </ul>
          </div>

          <!-- BROWSE TAB -->
          <div v-if="activeTab === 'browse'">
            <!-- Category Filter -->
            <div class="category-filter mb-5">
              <span class="category-selector">
                <input
                  type="radio"
                  name="skill_category"
                  id="category_all"
                  :checked="!selectedCategory"
                  @change="setCategory(null)"
                />
                <label for="category_all" class="radio category">
                  <span class="material-symbols-outlined mr-1">apps</span>
                  All
                </label>
                <template v-for="cat in categories" :key="cat.key">
                  <input
                    type="radio"
                    name="skill_category"
                    :id="'category_' + cat.key"
                    :checked="selectedCategory === cat.key"
                    @change="setCategory(cat.key)"
                  />
                  <label :for="'category_' + cat.key" class="radio category">
                    <span
                      class="material-symbols-outlined mr-1"
                      style="font-size: 32px !important"
                    >
                      {{ cat.icon }}
                    </span>
                    {{ cat.label }}
                  </label>
                </template>
              </span>
            </div>

            <!-- Skills Grid -->
            <div v-if="filteredSkills.length > 0" class="skills-grid">
              <div
                v-for="skill in filteredSkills"
                :key="skill.id"
                class="skill-card models__activity--payouts"
                :class="{
                  'is-owned': canRunSkill(skill.id).canRun,
                  featured: skill.featured,
                }"
              >
                <div class="skill-header">
                  <h3
                    class="skill-name is-size-3 fira-sans-condensed-black-italic"
                  >
                    <span class="material-symbols-outlined mr-2 is-size-3">
                      {{ getCategoryIcon(skill.category) }}
                    </span>
                    {{ skill.name }}
                  </h3>
                  <div class="tags">
                    <span
                      class="tag is-info is-medium fira-sans-condensed-black-italic"
                    >
                      {{ getCategoryLabel(skill.category) }}
                    </span>
                    <span
                      class="tag is-warning is-medium fira-sans-condensed-black-italic"
                    >
                      {{ getRequiredLevel(skill) }} REQUIRED
                    </span>
                    <span
                      v-if="skill.author?.verified"
                      class="tag is-success is-medium fira-sans-condensed-black-italic"
                    >
                      Verified
                    </span>
                    <span
                      v-if="skill.tags?.includes('demo')"
                      class="tag is-link is-medium fira-sans-condensed-black-italic"
                    >
                      Demo
                    </span>
                  </div>
                </div>

                <p class="skill-description">{{ skill.description }}</p>

                <hr />

                <div class="skill-footer">
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
                      <button
                        class="button is-warning is-medium fira-sans-condensed-black-italic"
                        @click="openUnlockModal(skill)"
                      >
                        <span
                          class="material-symbols-outlined mr-2"
                          style="font-size: 24px"
                        >
                          lock_open
                        </span>
                        UNLOCK {{ getRequiredLevel(skill) }}
                      </button>
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="notification is-info">
              <span class="fira-sans-condensed-black-italic is-size-1">
                Coming Soon.
              </span>
            </div>
          </div>

          <!-- MY SKILLS TAB -->
          <div v-if="activeTab === 'my-skills'">
            <div
              v-if="accessibleSkills.length === 0"
              class="notification is-warning p-5"
            >
              <span class="material-symbols-outlined mr-2 is-size-1">lock</span>
              <h2 class="fira-sans-condensed-black-italic is-size-3 mt-5">
                Connect Wallet or Upgrade your Level to unlock skills.
              </h2>
              <div class="control has-text-center mt-5 mb-5">
                <button
                  class="button is-success is-large"
                  @click="activeTab = 'browse'"
                >
                  <span class="material-symbols-outlined mr-2">
                    shopping_cart
                  </span>
                  Browse Skills
                </button>
              </div>
            </div>

            <div v-else>
              <!-- DOWNLOAD REQUIRED (only when not actively downloading and check is complete) -->
              <div
                v-if="
                  modelAvailabilityChecked &&
                  skillModelRequirements.length > 0 &&
                  hasMissingModels &&
                  !downloads.active
                "
                class="notification is-danger mb-6 mt-4 p-6 has-text-left"
              >
                <div class="mb-2">
                  <strong class="fira-sans-condensed-black-italic is-size-2">
                    Download Required
                  </strong>
                  <!-- Show all missing repos -->
                  <ul style="margin-top: 0.5rem; text-transform: lowercase">
                    <template v-for="model in missingModels" :key="model.key">
                      <li
                        v-for="repo in modelReadinessDetails[model.key]
                          ?.repos || []"
                        :key="repo"
                      >
                        <span class="material-symbols-outlined is-size-3 mr-1">
                          deployed_code
                        </span>
                        {{ repo }}
                      </li>
                    </template>
                  </ul>
                  <!-- Show all missing files/ggufs -->
                  <ul style="text-transform: lowercase">
                    <template
                      v-for="model in missingModels"
                      :key="model.key + '_files'"
                    >
                      <li
                        v-for="file in modelReadinessDetails[model.key]
                          ?.files || []"
                        :key="file"
                      >
                        <span class="material-symbols-outlined is-size-3 mr-1">
                          deployed_code
                        </span>
                        {{ file }}
                      </li>
                      <!-- Fallback for models without repo/file details -->
                      <template
                        v-if="
                          !modelReadinessDetails[model.key]?.repos?.length &&
                          !modelReadinessDetails[model.key]?.files?.length
                        "
                      >
                        <!-- Handle array repos (e.g., Qwen TTS) -->
                        <template v-if="Array.isArray(model.repo)">
                          <li
                            v-for="(r, rIdx) in model.repo"
                            :key="model.key + '_fallback_repo_' + rIdx"
                          >
                            <span
                              class="material-symbols-outlined is-size-3 mr-1"
                            >
                              deployed_code
                            </span>
                            {{ r }}
                          </li>
                        </template>
                        <!-- Handle single repo/filename -->
                        <li v-else>
                          <span
                            class="material-symbols-outlined is-size-3 mr-1"
                          >
                            deployed_code
                          </span>
                          {{ model.filename || model.repo || model.name }}
                        </li>
                      </template>
                    </template>
                  </ul>
                </div>
                <hr />
                <div class="buttons">
                  <button
                    class="button is-warning mr-5 is-large"
                    @click="downloadAllMissingModels"
                    :disabled="downloads.active"
                  >
                    <span class="material-symbols-outlined mr-1">download</span>
                    Download Now
                  </button>
                </div>
              </div>

              <!-- DOWNLOAD PROGRESS (like GenerativeImage.vue) -->
              <div
                v-if="downloads && downloads.active"
                class="notification is-info p-6 mb-6 mt-4 has-text-left"
              >
                <p class="mb-2">
                  <span class="fira-sans-condensed-black-italic is-size-4">
                    Downloading
                    <button
                      disabled
                      class="button is-loading is-info is-small mr-2 p-4"
                    ></button>
                  </span>
                  <span
                    class="fira-sans-condensed-black-italic is-pulled-right is-size-1"
                  >
                    {{ Math.round(downloads.total_progress || 0) }}%
                  </span>
                </p>
                <progress
                  class="progress is-success is-large"
                  :value="downloads.progress || 0"
                  max="100"
                >
                  {{ Math.round(downloads.progress || 0) }}%
                </progress>
                <div
                  v-if="downloadTaskList.length"
                  style="max-height: 180px; overflow: auto"
                >
                  <ul>
                    <li
                      v-for="t in downloadTaskList"
                      :key="t.task_id"
                      class="is-size-7 columns"
                      style="text-transform: lowercase"
                    >
                      <div class="column has-text-left">
                        <span class="material-symbols-outlined is-size-6">
                          deployed_code
                        </span>
                        {{ t.filename || t.name || t.task_id }} —
                        <span class="fira-sans-condensed-black-italic">
                          {{ t.status }}
                        </span>
                      </div>
                      <div
                        class="column is-2 fira-sans-condensed-black-italic has-text-right"
                      >
                        {{ Math.round(t.progress || 0) }}%
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- POLYMARKET SKILL (modular component) -->
              <div
                v-if="selectedSkillId === 'polymarket-top-performers-v1.0.0'"
              >
                <PolymarketSkill
                  :skill="selectedSkill"
                  :model-available="isModelAvailable"
                  @analyzing="isAnalyzing = $event"
                />
              </div>

              <!-- TCG SKILL (modular component) -->
              <div
                v-else-if="selectedSkillId === 'tcg-insurance-v1.0.0'"
                class="tcg-interface"
              >
                <TCGSkill
                  :skill="selectedSkill"
                  @market-created="
                    showNotification('Prediction market created!', 'success')
                  "
                />
              </div>

              <!-- DSLA SKILL (modular component) -->
              <div
                v-else-if="selectedSkillId === 'prediction-market-maker-v1.0.0'"
              >
                <DSLASkill
                  :skill="selectedSkill"
                  @market-created="
                    showNotification('Prediction market created!', 'success')
                  "
                />
              </div>

              <!-- MEDITATION FORGE SKILL (modular component) -->
              <div
                v-else-if="selectedSkillId === 'meditation-forge-v1.0.0'"
                class="meditation-interface"
              >
                <MeditationForgeSkill
                  :skill="selectedSkill"
                  :model-available="isModelAvailable"
                  @meditation-created="
                    showNotification('Meditation session created!', 'success')
                  "
                  @status-update="loadingMessage = $event"
                />
              </div>

              <!-- Roleplay Companion - Special Chat Interface -->
              <div
                v-else-if="selectedSkillId === 'roleplay-companion-v1.0.0'"
                class="roleplay-interface"
              >
                <div class="models__activity--payouts mb-4 has-text-left">
                  <!-- Skill Header -->
                  <div class="columns is-vcentered">
                    <div class="column">
                      <h3
                        class="skill-name is-size-1 fira-sans-condensed-black-italic"
                      >
                        <span
                          class="material-symbols-outlined mr-2"
                          style="font-size: 48px; color: var(--bulma-primary)"
                        >
                          {{ getCategoryIcon(selectedSkill.category) }}
                        </span>
                        {{ selectedSkill.name }}
                      </h3>
                      <p class="is-size-5 mt-3">
                        {{ selectedSkill.description }}
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Roleplay Chat Component -->
                <RoleplayChat
                  :skill="selectedSkill"
                  @charge-fee="handleRoleplayFee"
                />
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
      <div
        class="position-modal"
        :class="positionModal.side === 'for' ? 'is-for' : 'is-against'"
      >
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
            {{ positionModal.side === "for" ? "thumb_up" : "thumb_down" }}
          </span>
          <h2
            class="fira-sans-condensed-black-italic is-size-3 has-text-centered"
          >
            Open {{ positionModal.side === "for" ? "FOR" : "AGAINST" }} Position
          </h2>
        </div>

        <div class="position-modal-body">
          <div class="position-market-preview">
            <div class="position-modal-status mb-4">
              <span
                class="position-status-pill fira-sans-condensed-black-italic is-size-6"
              >
                {{
                  positionModal.side === "for" ? "STAKING YES" : "STAKING NO"
                }}
              </span>
            </div>
            <p class="position-question has-text-centered">
              {{ positionModal.market?.question }}
            </p>
          </div>

          <div class="position-form-section">
            <div class="position-field">
              <label
                class="position-label fira-sans-condensed-black-italic is-size-5 has-text-left"
              >
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
              <strong>
                {{ positionModal.side === "for" ? "be met" : "NOT be met" }}
              </strong>
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
                <span
                  class="material-symbols-outlined mr-1"
                  style="font-size: 18px; vertical-align: middle"
                >
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
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 14px"
                      >
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

              <button class="button is-small is-info" @click="addDataSource">
                <span
                  class="material-symbols-outlined mr-1"
                  style="font-size: 14px"
                >
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
              !tcgMarketModal.dataSources.some((s) => s.name && s.endpoint)
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
              <span
                class="material-symbols-outlined mr-1"
                style="vertical-align: middle; font-size: 20px"
              >
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
                    {{
                      Math.round(
                        (tokenIssuanceModal.initialLiquidityTokens /
                          tokenIssuanceModal.totalSupply) *
                          100,
                      ) || 0
                    }}% of supply
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
            <div
              v-if="isDslaSkill(tokenIssuanceModal.skill)"
              class="dsla-pool-section mt-5"
            >
              <h5 class="fira-sans-condensed-black-italic has-text-info mb-3">
                <span
                  class="material-symbols-outlined mr-1"
                  style="vertical-align: middle; font-size: 18px"
                >
                  currency_exchange
                </span>
                DSLA Pool (Prediction Market)
              </h5>

              <div class="notification is-info is-light mb-3">
                <p class="is-size-7">
                  As a DSLA prediction market skill, an additional SKILL/DSLA
                  liquidity pool will be created.
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
                      <span v-else class="has-text-danger">Unavailable</span>
                    </p>
                    <p
                      v-if="dslaEthPrice && tokenIssuanceModal.startingPriceEth"
                      class="is-size-7 has-text-grey-light mt-1"
                    >
                      Starting Price in DSLA:
                      <strong class="has-text-info">
                        {{
                          (
                            parseFloat(tokenIssuanceModal.startingPriceEth) /
                            dslaEthPrice
                          ).toFixed(2)
                        }}
                        DSLA
                      </strong>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Progress -->
          <div
            v-if="tokenIssuanceModal.isIssuing"
            class="issuance-progress mt-4"
          >
            <div class="notification is-warning">
              <div class="columns is-vcentered">
                <div class="column is-narrow">
                  <span
                    class="material-symbols-outlined rotating"
                    style="font-size: 32px"
                  >
                    progress_activity
                  </span>
                </div>
                <div class="column">
                  <p class="fira-sans-condensed-black-italic">
                    {{ tokenIssuanceModal.progress.message || "Processing..." }}
                  </p>
                  <p class="is-size-7 has-text-grey">
                    Step {{ tokenIssuanceModal.progress.step }} of
                    {{ tokenIssuanceModal.progress.total }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Summary -->
          <div
            v-if="!tokenIssuanceModal.isIssuing"
            class="tcg-preview-box mt-4"
          >
            <p class="tcg-preview-text has-text-centered">
              <strong>{{ tokenIssuanceModal.tokenSymbol }}</strong>
              token will be created with
              <strong>
                {{ Number(tokenIssuanceModal.totalSupply).toLocaleString() }}
              </strong>
              total supply.
              <br />
              <span class="is-size-7">
                SKILL/ETH pool with
                {{ tokenIssuanceModal.initialLiquidityEth }} ETH liquidity
                <span
                  v-if="
                    isDslaSkill(tokenIssuanceModal.skill) &&
                    tokenIssuanceModal.initialLiquidityDsla
                  "
                >
                  + SKILL/DSLA pool with
                  {{
                    Number(
                      tokenIssuanceModal.initialLiquidityDsla,
                    ).toLocaleString()
                  }}
                  DSLA
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
            <span
              v-if="tokenIssuanceModal.isIssuing"
              class="material-symbols-outlined rotating mr-2"
            >
              progress_activity
            </span>
            <span v-else class="material-symbols-outlined mr-2">
              rocket_launch
            </span>
            {{
              tokenIssuanceModal.isIssuing
                ? "Issuing..."
                : "Issue Token & Create Pool"
            }}
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
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from "vue";
import VueMarkdown from "vue-markdown-render";
import axios from "axios";
import { io } from "socket.io-client";
import { useSkillStore } from "../stores/skillStore.js";
import { SKILL_CATEGORY_META } from "../skills/types.js";
import polymarketAgent from "./polymarketAgent.js";
import { tokenService } from "../services/token.service.js";
import { requestOpenLevelModal } from "../services/level.service.js";
import SkillRunner from "./skills/SkillRunner.vue";
import RoleplayChat from "./skills/RoleplayChat.vue";
import SkillDownloader from "./skills/SkillDownloader.vue";
import PolymarketSkill from "./skills/PolymarketSkill.vue";
import TCGSkill from "./skills/TCGSkill.vue";
import DSLASkill from "./skills/DSLASkill.vue";
import MeditationForgeSkill from "./skills/MeditationForgeSkill.vue";
import {
  getSkillModelRequirements,
  MODEL_REQUIREMENTS,
} from "../skills/flagship.js";

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const WS_DL = `${API_BASE}/downloads`;

export default {
  name: "SmartAgent",
  components: {
    VueMarkdown,
    SkillRunner,
    RoleplayChat,
    SkillDownloader,
    PolymarketSkill,
    TCGSkill,
    DSLASkill,
    MeditationForgeSkill,
  },
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
    const selectedSkill = computed(() =>
      skillStore.getSkillById(selectedSkillId.value),
    );
    const skillInputs = reactive({});
    const isExecuting = ref(false);
    const executionStatus = ref("");
    const executionResults = reactive({});

    // Model requirements state
    const modelAvailability = reactive({});
    const modelReadinessDetails = reactive({}); // Stores { repos: [], files: [] } per model key
    const modelAvailabilityChecked = ref(false);
    const downloadingModelKey = ref(null);
    const autoFillPrompt = ref("");
    const isAutoFilling = ref(false);

    // Downloads state (like GenerativeImage.vue)
    const downloads = reactive({
      active: false,
      pipelineId: null,
      progress: 0,
      total_progress: 0,
      status: null,
      pipeline: { tasks: {} },
      wsUrl: null,
    });
    const downloadsSocket = ref(null);
    const lastDlEventAt = ref(0);
    let httpPollTimer = null;
    let completionCheckTimer = null;
    const MAX_POLL_LIFETIME_MS = 30 * 60 * 1000; // 30 minutes max polling
    let pollStartTime = 0;

    // Download task list computed
    const downloadTaskList = computed(() => {
      const tasks = downloads.pipeline?.tasks || {};
      const arr = Object.values(tasks);
      const order = {
        downloading: 0,
        pending: 1,
        completed: 2,
        failed: 3,
        cancelled: 4,
      };
      arr.sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));
      return arr;
    });

    // Computed: Model requirements for selected skill
    const skillModelRequirements = computed(() => {
      if (!selectedSkillId.value) return [];
      return getSkillModelRequirements(selectedSkillId.value);
    });

    const missingModels = computed(() => {
      return skillModelRequirements.value.filter(
        (model) => !isModelReady(model),
      );
    });

    const hasMissingModels = computed(() => {
      return missingModels.value.length > 0;
    });

    // Check if a model is ready/available
    const isModelReady = (model) => {
      // For LLM models, check file availability - default to NOT available until checked
      if (model.type === "llm") {
        if (!modelAvailabilityChecked.value) return false;
        return modelAvailability[model.filename] === true;
      }
      // For Flask models (diffusion/audio/video/3d/vision), check if Flask reported them as ready
      if (
        model.type === "diffusion" ||
        model.type === "audio" ||
        model.type === "video" ||
        model.type === "3d" ||
        model.type === "vision"
      ) {
        if (!modelAvailabilityChecked.value) return false;
        // If we checked and it's marked available, it's ready
        // If we checked and it's not in the map, assume it needs download
        const ready = modelAvailability[model.key] === true;
        console.log(
          `[SmartAgent] isModelReady ${model.key}: ${ready}, modelAvailability:`,
          modelAvailability[model.key],
        );
        return ready;
      }
      return true;
    };

    // Cache for model availability checks (5 minute TTL)
    const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
    let lastModelCheckTimestamp = 0;

    // Check model availability on mount and when skill changes
    const checkModelAvailability = async (forceRefresh = false) => {
      // Skip if recently checked (within TTL) unless forced
      const now = Date.now();
      if (!forceRefresh && lastModelCheckTimestamp > 0 && now - lastModelCheckTimestamp < MODEL_CACHE_TTL_MS) {
        console.log("[SmartAgent] Using cached model availability (checked", Math.round((now - lastModelCheckTimestamp) / 1000), "s ago)");
        return;
      }

      console.log("[SmartAgent] Checking model availability...");

      // Check LLM models via electron API - PARALLEL checks
      if (window.electronAPI?.checkModel) {
        const llmModelKeys = ["llm_default", "llm_hermes", "llm_mythomax"];

        // Run all LLM checks in parallel
        const llmChecks = llmModelKeys.map(async (key) => {
          const model = MODEL_REQUIREMENTS[key];
          if (model?.filename) {
            try {
              const exists = await window.electronAPI.checkModel(model.filename);
              modelAvailability[model.filename] = exists;
              console.log(
                `[SmartAgent] LLM model ${model.filename}: ${exists ? "available" : "not found"}`,
              );
            } catch (e) {
              console.warn(`[SmartAgent] Failed to check model ${model.filename}:`, e);
              modelAvailability[model.filename] = false;
            }
          }
        });

        await Promise.all(llmChecks);
      }

      // Check Flask server readiness for diffusion/audio/video models via /pipelines/plan
      const port = window.BONZAI_SERVER_PORT || 65000;

      // Pipeline mappings: model key -> pipeline name (keys match MODEL_REQUIREMENTS)
      const pipelineMap = {
        image_standard: "image_standard",
        image_turbo: "image_turbo",
        image_quality: "image_quality",
        image_advanced: "image_advanced",
        audio: "audio",
        audio_turbo: "audio_turbo",
        audio_quality: "audio_quality_persona",
        video_fast: "video_fast",
        vision: "qwen3_vision",
        // 'trellis_3d': '3d', // Not defined in Flask yet
      };

      // Check each pipeline in parallel
      const pipelineChecks = Object.entries(pipelineMap).map(
        async ([modelKey, pipeline]) => {
          try {
            console.log(
              `[SmartAgent] Checking pipeline ${pipeline} for model ${modelKey}...`,
            );
            const response = await fetch(
              `http://localhost:${port}/pipelines/plan`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pipeline }),
              },
            );
            if (response.ok) {
              const data = await response.json();
              console.log(
                `[SmartAgent] Pipeline ${pipeline} (${modelKey}) response:`,
                JSON.stringify(data, null, 2),
              );

              // Use the top-level ok field from the server response
              if (data.ok === true) {
                modelAvailability[modelKey] = true;
                modelReadinessDetails[modelKey] = { repos: [], files: [] };
                console.log(`[SmartAgent] ✓ Model ${modelKey} is READY`);
              } else {
                modelAvailability[modelKey] = false;
                // Store missing repos and files for display
                // Flatten repos in case r.repo is an array (e.g., Qwen TTS has multiple repos)
                const missingRepos = (data.repos || [])
                  .filter(
                    (r) =>
                      r.ok === false ||
                      (Number.isFinite(r.missing) && r.missing > 0),
                  )
                  .flatMap((r) => (Array.isArray(r.repo) ? r.repo : [r.repo]));
                const missingFiles = (data.required_files || [])
                  .filter((f) => !f.ok || !f.exists)
                  .map((f) => (f.path || f.name || "").split("/").pop());
                modelReadinessDetails[modelKey] = {
                  repos: missingRepos,
                  files: missingFiles,
                };
                console.log(
                  `[SmartAgent] ✗ Model ${modelKey} needs download:`,
                  modelReadinessDetails[modelKey],
                );
              }
            } else {
              console.error(
                `[SmartAgent] HTTP error for pipeline ${pipeline}: ${response.status} ${response.statusText}`,
              );
              modelAvailability[modelKey] = false;
              modelReadinessDetails[modelKey] = {
                repos: [],
                files: [],
                error: `HTTP ${response.status}`,
              };
            }
          } catch (e) {
            console.error(
              `[SmartAgent] Failed to check pipeline ${pipeline}:`,
              e.message,
            );
            // If Flask isn't running, don't mark as available
            modelAvailability[modelKey] = false;
            modelReadinessDetails[modelKey] = {
              repos: [],
              files: [],
              error: e.message,
            };
          }
        },
      );

      await Promise.all(pipelineChecks);

      modelAvailabilityChecked.value = true;
      lastModelCheckTimestamp = Date.now();
    };

    const getModelTypeIcon = (type) => {
      const icons = {
        llm: "psychology",
        diffusion: "image",
        audio: "headphones",
        video: "movie",
        "3d": "3d_rotation",
      };
      return icons[type] || "deployed_code";
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // DOWNLOAD TRACKING (like GenerativeImage.vue)
    // ═══════════════════════════════════════════════════════════════════════════

    const socketOpts = {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    };

    const mergeTask = (existing, incoming) => {
      if (!existing) return incoming;
      return {
        ...existing,
        ...incoming,
        progress: Math.max(existing.progress || 0, incoming.progress || 0),
      };
    };

    const computeTotalFromTasks = (tasks) => {
      const arr = Object.values(tasks || {});
      if (!arr.length) return 0;
      let totalBytes = 0;
      let doneBytes = 0;
      for (const t of arr) {
        if (t.total_size) {
          totalBytes += t.total_size;
          doneBytes += t.downloaded_size || 0;
        }
      }
      if (totalBytes > 0) return (doneBytes / totalBytes) * 100;
      const sumPct = arr.reduce((s, t) => s + Number(t.progress || 0), 0);
      return sumPct / arr.length;
    };

    const applyPipelineUpdate = (p) => {
      if (!p) return;
      downloads.pipelineId = p.pipeline_id || downloads.pipelineId;
      downloads.status = p.status || downloads.status || "downloading";

      const existing = downloads.pipeline?.tasks || {};
      const incoming = p.tasks || {};
      const merged = { ...existing };
      for (const [tid, t] of Object.entries(incoming)) {
        merged[tid] = mergeTask(existing[tid], t);
      }
      downloads.pipeline = {
        ...(downloads.pipeline || {}),
        ...p,
        tasks: merged,
      };

      const serverPct = Number(p.total_progress ?? 0);
      const tasksPct = computeTotalFromTasks(merged);
      let next =
        Number.isFinite(serverPct) && serverPct > 0 ? serverPct : tasksPct;

      // Don't show 100% until every task is finished
      const tasksList = Object.values(merged);
      const anyActive = tasksList.some((t) =>
        ["downloading", "pending"].includes(t.status),
      );
      if (anyActive) next = Math.min(next, 99.9);

      downloads.total_progress = next;
      downloads.progress = next;
      downloadProgress.value = Math.round(next);

      // If all tasks complete, force completion
      const allTasksComplete =
        tasksList.length > 0 &&
        tasksList.every((t) => t.status === "completed");
      if (allTasksComplete && downloads.status === "downloading") {
        downloads.status = "completed";
      }

      const wasActive = downloads.active;
      downloads.active = !["completed", "failed", "cancelled"].includes(
        downloads.status,
      );

      // Immediately refresh model availability when download completes
      if (wasActive && !downloads.active && downloads.status === "completed") {
        console.log("[Downloads] Download completed, refreshing model availability");
        checkModelAvailability();
      }
    };

    const ensureDownloadsSocket = (base = WS_DL) => {
      if (downloadsSocket.value) {
        try {
          downloadsSocket.value.disconnect();
        } catch {}
      }
      downloads.wsUrl = base;
      downloadsSocket.value = io(base, socketOpts);

      downloadsSocket.value.on("connect", () => {
        if (downloads.pipelineId) {
          downloadsSocket.value.emit("subscribe", {
            pipeline_id: downloads.pipelineId,
          });
        }
      });

      downloadsSocket.value.on("download_progress", ({ pipeline }) => {
        lastDlEventAt.value = Date.now();
        if (!pipeline) return;
        applyPipelineUpdate(pipeline);
      });
    };

    const kickHttpPollIfStale = (pipelineId) => {
      if (httpPollTimer) return;
      pollStartTime = Date.now();
      httpPollTimer = setInterval(async () => {
        // Safety: stop polling after max lifetime to prevent runaway timers
        if (Date.now() - pollStartTime > MAX_POLL_LIFETIME_MS) {
          console.warn("[SmartAgent] HTTP poll timer exceeded max lifetime, stopping");
          clearInterval(httpPollTimer);
          httpPollTimer = null;
          return;
        }
        const idleMs = Date.now() - lastDlEventAt.value;
        if (idleMs < 1500) return;
        try {
          const { data } = await axios.get(
            `${API_BASE}/downloads/status/${pipelineId}`,
          );
          if (data) {
            applyPipelineUpdate(data);
            if (!downloads.active) {
              clearInterval(httpPollTimer);
              httpPollTimer = null;
            }
          }
        } catch {
          clearInterval(httpPollTimer);
          httpPollTimer = null;
        }
      }, 1000);
    };

    const connectAndSubscribe = (pipelineId, websocketUrl) => {
      if (!pipelineId) return;
      ensureDownloadsSocket(websocketUrl || WS_DL);
      downloads.active = true;
      downloads.pipelineId = pipelineId;
      downloads.status = downloads.status || "downloading";
      try {
        downloadsSocket.value.emit("subscribe", { pipeline_id: pipelineId });
      } catch {}
      kickHttpPollIfStale(pipelineId);
    };

    const startDownloadTracking = (pipelineId, websocketUrl) => {
      connectAndSubscribe(pipelineId, websocketUrl);
      // Clear any existing completion timer
      if (completionCheckTimer) {
        clearInterval(completionCheckTimer);
      }
      const timerStartTime = Date.now();
      completionCheckTimer = setInterval(async () => {
        // Safety: stop after max lifetime
        if (Date.now() - timerStartTime > MAX_POLL_LIFETIME_MS) {
          console.warn("[SmartAgent] Completion check timer exceeded max lifetime, stopping");
          clearInterval(completionCheckTimer);
          completionCheckTimer = null;
          return;
        }
        if (!downloads.active && downloads.status !== "failed") {
          clearInterval(completionCheckTimer);
          completionCheckTimer = null;
          await checkModelAvailability(true); // Force refresh after download completes
        }
        if (downloads.status === "failed") {
          clearInterval(completionCheckTimer);
          completionCheckTimer = null;
        }
      }, 1000);
    };

    // Resume active downloads when view is loaded
    const resumeActiveDownloadIfAny = async () => {
      let hasActiveDownloads = false;

      // Check for active LLM downloads via Electron API
      try {
        const activeLLM = await window.electronAPI?.getActiveDownloads?.() || [];
        if (activeLLM.length > 0) {
          hasActiveDownloads = true;
          downloads.active = true;
          downloads.status = "downloading";
          downloads.pipeline = downloads.pipeline || { tasks: {} };

          for (const dl of activeLLM) {
            const taskId = `llm_${dl.filename}`;
            downloads.pipeline.tasks[taskId] = {
              task_id: taskId,
              filename: dl.filename,
              status: "downloading",
              progress: Math.round((dl.percent || 0) * 100),
              total_size: 0,
              downloaded_size: 0,
            };
          }

          // Subscribe to progress updates
          window.electronAPI.onDownloadProgress((e, data) => {
            const taskId = `llm_${data.filename}`;
            if (downloads.pipeline.tasks[taskId]) {
              downloads.pipeline.tasks[taskId].progress = Math.round(data.percent * 100);
              const totalPct = computeTotalFromTasks(downloads.pipeline.tasks);
              downloads.progress = totalPct;
              downloads.total_progress = totalPct;
              downloadProgress.value = Math.round(totalPct);
            }
          });

          const totalPct = computeTotalFromTasks(downloads.pipeline.tasks);
          downloads.progress = totalPct;
          downloads.total_progress = totalPct;
          downloadProgress.value = Math.round(totalPct);

          console.log("[SmartAgent] Resuming active LLM downloads:", activeLLM.length);
        }
      } catch (e) {
        console.error("[SmartAgent] Failed to check active LLM downloads:", e);
      }

      // Check for active Flask pipeline downloads
      try {
        const { data } = await axios.get(`${API_BASE}/downloads/list`);
        const active = (data?.pipelines || []).filter((p) =>
          ["pending", "downloading", "retrying", "waiting_retry"].includes(
            p.status
          )
        );

        if (active.length > 0) {
          hasActiveDownloads = true;
          downloads.active = true;
          downloads.status = "downloading";
          downloads.pipeline = downloads.pipeline || { tasks: {} };

          console.log("[SmartAgent] Resuming active Flask downloads:", active.length);

          ensureDownloadsSocket();

          // Subscribe to each active pipeline
          for (const pl of active) {
            connectAndSubscribe(pl.pipeline_id);

            // Merge existing tasks into downloads.pipeline.tasks
            if (pl.tasks) {
              for (const [tid, task] of Object.entries(pl.tasks)) {
                downloads.pipeline.tasks[tid] = {
                  task_id: tid,
                  filename: task.name || task.filename || tid,
                  name: task.name,
                  status: task.status || "downloading",
                  progress: task.progress || 0,
                  total_size: task.total_bytes || task.total_size || 0,
                  downloaded_size: task.done_bytes || task.downloaded_size || 0,
                };
              }
            }
          }

          // Update overall progress
          const totalPct = computeTotalFromTasks(downloads.pipeline.tasks);
          downloads.progress = totalPct;
          downloads.total_progress = totalPct;
          downloadProgress.value = Math.round(totalPct);
        }
      } catch (e) {
        console.error("[SmartAgent] Failed to resume active Flask downloads:", e);
      }

      if (!hasActiveDownloads) {
        downloads.active = false;
      }
    };

    // Download all missing models
    const downloadAllMissingModels = async () => {
      const missing = missingModels.value;
      if (missing.length === 0) return;

      // Reset download state
      downloads.active = true;
      downloads.progress = 0;
      downloads.total_progress = 0;
      downloads.status = "downloading";
      downloads.pipeline = { tasks: {} };
      downloadingModelKey.value = "all";
      downloadProgress.value = 0;

      let hasActiveDownload = false;

      try {
        // Collect all pipelines to prefetch
        const pipelines = [];
        for (const model of missing) {
          if (model.type === "llm" && model.url) {
            // LLM models via electron API
            if (window.electronAPI?.downloadModel) {
              hasActiveDownload = true;

              // Create a task entry for this LLM download
              const taskId = `llm_${model.filename}`;
              downloads.pipeline.tasks[taskId] = {
                task_id: taskId,
                filename: model.filename,
                status: "downloading",
                progress: 0,
                total_size: 0,
                downloaded_size: 0,
              };

              const progressHandler = (e, data) => {
                if (data.filename === model.filename) {
                  const pct = Math.round(data.percent * 100);

                  // Update task progress
                  if (downloads.pipeline.tasks[taskId]) {
                    downloads.pipeline.tasks[taskId].progress = pct;
                    downloads.pipeline.tasks[taskId].downloaded_size = data.downloaded || 0;
                    downloads.pipeline.tasks[taskId].total_size = data.total || 0;
                  }

                  // Recalculate total progress from all tasks
                  const totalPct = computeTotalFromTasks(downloads.pipeline.tasks);
                  downloadProgress.value = Math.round(totalPct);
                  downloads.progress = totalPct;
                  downloads.total_progress = totalPct;
                }
              };
              window.electronAPI.onDownloadProgress(progressHandler);

              const success = await window.electronAPI.downloadModel(
                model.url,
                model.filename,
              );

              // Mark task as completed or failed
              if (downloads.pipeline.tasks[taskId]) {
                downloads.pipeline.tasks[taskId].status = success ? "completed" : "failed";
                downloads.pipeline.tasks[taskId].progress = success ? 100 : downloads.pipeline.tasks[taskId].progress;
              }

              if (success) {
                modelAvailability[model.filename] = true;
              }
            }
          } else if (
            model.type === "diffusion" ||
            model.type === "audio" ||
            model.type === "video" ||
            model.type === "3d" ||
            model.type === "vision"
          ) {
            const pipeline = model.pipeline || model.key;
            if (pipeline) {
              pipelines.push({ pipeline, model });
            }
          }
        }

        // Check if all LLM downloads completed (Flask pipelines haven't started yet)
        const allLLMTasksComplete = Object.values(downloads.pipeline.tasks || {}).every(
          (t) => t.status === "completed" || t.status === "failed"
        );
        const hasLLMTasks = Object.keys(downloads.pipeline.tasks || {}).length > 0;

        // Prefetch all Flask pipelines together
        if (pipelines.length > 0) {
          for (const { pipeline, model } of pipelines) {
            try {
              const res = await axios.post(
                `${API_BASE}/pipelines/prefetch`,
                { pipeline, deep_validate: true },
                { validateStatus: () => true },
              );

              console.log(
                `[SmartAgent] Prefetch ${pipeline}:`,
                res.status,
                res.data,
              );

              if (res.status === 202 && res.data?.pipeline_id) {
                // Start tracking downloads via socket
                hasActiveDownload = true;
                startDownloadTracking(
                  res.data.pipeline_id,
                  res.data.websocket_url || WS_DL,
                );
              } else if (res.status === 200) {
                // Already downloaded - mark as available
                modelAvailability[model.key] = true;
                modelReadinessDetails[model.key] = { repos: [], files: [] };
                console.log(
                  `[SmartAgent] Model ${model.key} already downloaded`,
                );
              }
            } catch (e) {
              console.error(`[SmartAgent] Prefetch failed for ${pipeline}:`, e);
            }
          }
        }

        // If no active downloads started (all models already available), complete immediately
        if (!hasActiveDownload) {
          console.log("[SmartAgent] All models already downloaded, completing");
          downloads.status = "completed";
          downloads.active = false;
          downloads.progress = 100;
          downloads.total_progress = 100;
        }
        // If only LLM downloads occurred (no Flask pipelines) and they're all done
        else if (pipelines.length === 0 && hasLLMTasks && allLLMTasksComplete) {
          console.log("[SmartAgent] All LLM downloads completed, finishing");
          downloads.status = "completed";
          downloads.active = false;
          downloads.progress = 100;
          downloads.total_progress = 100;
        }
      } catch (e) {
        console.error("[SmartAgent] Download error:", e);
        downloads.status = "failed";
        downloads.active = false;
      } finally {
        // Reset helper state if no active downloads
        if (!hasActiveDownload) {
          downloadingModelKey.value = null;
          downloadProgress.value = 0;
        }
      }

      // Re-check availability after downloads complete
      await checkModelAvailability();
    };

    // Auto-fill skill inputs using LLM
    const autoFillSkillInputs = async () => {
      if (!autoFillPrompt.value || isAutoFilling.value || !selectedSkill.value)
        return;

      isAutoFilling.value = true;

      try {
        // Build schema for LLM
        const inputSchema = Object.entries(selectedSkill.value.inputs)
          .filter(([key, field]) => !["image", "object"].includes(field.type))
          .map(([key, field]) => {
            let schema = `- "${key}": ${field.label || key}`;
            if (field.type === "select") {
              schema += ` (options: ${field.options.join(", ")})`;
            } else if (field.type === "number") {
              schema += ` (number${field.min !== undefined ? `, min: ${field.min}` : ""}${field.max !== undefined ? `, max: ${field.max}` : ""})`;
            }
            if (field.description) {
              schema += ` - ${field.description}`;
            }
            return schema;
          })
          .join("\n");

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
            const jsonMatch =
              response.match(/```(?:json)?\s*([\s\S]*?)```/) ||
              response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              json = JSON.parse(jsonMatch[1] || jsonMatch[0]);
            } else {
              json = JSON.parse(response);
            }

            // Apply generated values
            Object.entries(json).forEach(([key, value]) => {
              if (
                skillInputs.hasOwnProperty(key) ||
                selectedSkill.value.inputs[key]
              ) {
                skillInputs[key] = value;
              }
            });

            showNotification("Inputs auto-filled successfully!", "success");
          } catch (e) {
            console.warn("[SmartAgent] Failed to parse auto-fill response:", e);
            showNotification("Could not parse AI response", "warning");
          }
        }
      } catch (e) {
        console.error("[SmartAgent] Auto-fill error:", e);
        showNotification(`Auto-fill failed: ${e.message}`, "danger");
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
      { id: "pokemon", name: "Pokemon", icon: "amp_stories" },
      { id: "mtg", name: "Magic: The Gathering", icon: "amp_stories" },
      { id: "yugioh", name: "Yu-Gi-Oh!", icon: "amp_stories" },
      { id: "onepiece", name: "One Piece", icon: "amp_stories" },
      { id: "lorcana", name: "Lorcana", icon: "amp_stories" },
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
    const isFetchingDslaPrice = computed(
      () => tokenService.state.isFetchingPrice,
    );

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

    // Open level unlock modal for a skill
    const openUnlockModal = (skill) => {
      const levelStr = getRequiredLevel(skill); // e.g., 'LVL6'
      const levelNum = parseInt(levelStr.replace("LVL", ""), 10);
      if (levelNum >= 1 && levelNum <= 6) {
        requestOpenLevelModal(levelNum);
      }
    };

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
      return SKILL_CATEGORY_META[categoryKey]?.icon || "extension";
    };

    const getCategoryColor = (categoryKey) => {
      const colorMap = {
        entertainment: "is-danger",
        healthcare: "is-success",
        housing: "is-info",
        fashion: "is-warning",
        food: "is-primary",
        education: "is-link",
        reading: "is-dark",
        "personal-care": "is-light",
        "prediction-market": "is-info",
        analysis: "is-success",
        trading: "is-warning",
      };
      return colorMap[categoryKey] || "is-dark";
    };

    const formatOptionLabel = (opt) => {
      // Convert kebab-case or snake_case to Title Case
      return String(opt)
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    };

    const hasImageResults = (results) => {
      if (!results) return false;
      const str = JSON.stringify(results);
      return (
        str.includes("image") || str.includes("Image") || str.includes("base64")
      );
    };

    const extractImages = (results, path = "", images = []) => {
      if (!results) return images;

      for (const [key, value] of Object.entries(results)) {
        const currentPath = path ? `${path}.${key}` : key;

        if (
          typeof value === "string" &&
          value.length > 100 &&
          (key.toLowerCase().includes("image") ||
            key.toLowerCase().includes("portrait") ||
            key.toLowerCase().includes("cover") ||
            key.toLowerCase().includes("photo"))
        ) {
          images.push({ label: formatOptionLabel(key), data: value });
        } else if (Array.isArray(value)) {
          value.forEach((item, idx) => {
            if (typeof item === "object") {
              extractImages(item, `${currentPath}[${idx}]`, images);
            }
          });
        } else if (typeof value === "object" && value !== null) {
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
        const base64 = e.target.result.split(",")[1];
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
        showNotification(
          `${access.requiredLevel} required: ${access.reason}`,
          "warning",
        );
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
        if (skillId === "tcg-insurance-v1.0.0") {
          loadTcgTopCards();
        }
      }
    };

    const executeSelectedSkill = async () => {
      if (!selectedSkill.value) return;

      isExecuting.value = true;
      executionStatus.value = "Starting...";

      try {
        const result = await skillStore.executeSkill(selectedSkill.value.id, {
          ...skillInputs,
        });

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
      const categoryLabel =
        polymarketCategories.find(
          (c) => c.key === selectedPolymarketCategory.value,
        )?.label || "All Markets";
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
          },
        );

        // Store the analysis results (top 10 recommendations)
        analysisHistory.value = [
          {
            topTraders: results.topTraders || [],
            recommendations: (results.recommendations || []).slice(0, 10), // Top 10 high conviction positions
            meta: results.meta || {
              timePeriod: polymarketTimePeriod.value,
              category: selectedPolymarketCategory.value,
              minConviction: polymarketMinConviction.value,
              analyzedAt: new Date().toISOString(),
            },
          },
        ];

        console.log("[SmartAgent] Polymarket analysis complete:", results);

        if (results.recommendations?.length === 0) {
          showNotification(
            `No high conviction positions found for ${categoryLabel}. Try lowering consensus threshold.`,
            "info",
          );
        }
      } catch (e) {
        console.error("[SmartAgent] Polymarket analysis error:", e);
        analysisHistory.value = [{ error: e.message }];
        showNotification(`Analysis failed: ${e.message}`, "danger");
      } finally {
        isAnalyzing.value = false;
      }
    };

    const generateInvestmentThesis = async (analysisIdx, recIdx, rec) => {
      const key = `${analysisIdx}-${recIdx}`;
      investmentTheses.value[key] = {
        loading: true,
        thesis: null,
        error: null,
      };

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
          throw new Error(
            "No response from model. Please ensure the model is loaded.",
          );
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
            {
              id: "p1",
              name: "Charizard VMAX",
              set: "Champion's Path",
              rarity: "Ultra Rare",
              price: 350,
              priceChange: 15,
            },
            {
              id: "p2",
              name: "Pikachu VMAX",
              set: "Vivid Voltage",
              rarity: "Ultra Rare",
              price: 180,
              priceChange: 8,
            },
            {
              id: "p3",
              name: "Umbreon VMAX",
              set: "Evolving Skies",
              rarity: "Alternate Art",
              price: 420,
              priceChange: -5,
            },
          ],
          mtg: [
            {
              id: "m1",
              name: "Black Lotus",
              set: "Alpha",
              rarity: "Rare",
              price: 150000,
              priceChange: 5,
            },
            {
              id: "m2",
              name: "Mox Sapphire",
              set: "Beta",
              rarity: "Rare",
              price: 8500,
              priceChange: -3,
            },
          ],
          yugioh: [
            {
              id: "y1",
              name: "Blue-Eyes White Dragon",
              set: "LOB",
              rarity: "1st Edition",
              price: 2500,
              priceChange: 10,
            },
            {
              id: "y2",
              name: "Dark Magician",
              set: "LOB",
              rarity: "1st Edition",
              price: 1200,
              priceChange: 5,
            },
          ],
          onepiece: [
            {
              id: "o1",
              name: "Monkey D. Luffy",
              set: "OP01",
              rarity: "Leader",
              price: 45,
              priceChange: 20,
            },
            {
              id: "o2",
              name: "Roronoa Zoro",
              set: "OP01",
              rarity: "Super Rare",
              price: 85,
              priceChange: 12,
            },
          ],
          lorcana: [
            {
              id: "l1",
              name: "Elsa, Snow Queen",
              set: "The First Chapter",
              rarity: "Enchanted",
              price: 450,
              priceChange: -10,
            },
            {
              id: "l2",
              name: "Mickey Mouse, True Friend",
              set: "The First Chapter",
              rarity: "Enchanted",
              price: 280,
              priceChange: 5,
            },
          ],
        };

        tcgTopCards.value = mockCards[selectedTcgCollection.value] || [];
      } catch (e) {
        console.error("[SmartAgent] TCG load error:", e);
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
        tcgSearchResults.value = tcgTopCards.value.filter((c) =>
          c.name.toLowerCase().includes(query),
        );
      } catch (e) {
        console.error("[SmartAgent] TCG search error:", e);
      } finally {
        isTcgLoading.value = false;
      }
    };

    const addToPortfolio = (card) => {
      if (!userTcgPortfolio.value.some((c) => c.id === card.id)) {
        userTcgPortfolio.value.push({
          ...card,
          collection: selectedTcgCollection.value,
        });
      }
    };

    const removeFromPortfolio = (cardId) => {
      userTcgPortfolio.value = userTcgPortfolio.value.filter(
        (c) => c.id !== cardId,
      );
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
      const validSources = tcgMarketModal.dataSources.filter(
        (s) => s.name && s.endpoint,
      );
      if (validSources.length === 0) {
        showNotification(
          "Please add at least one data source with name and endpoint",
          "warning",
        );
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
        dataSources: validSources.map((s) => ({ ...s })),
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
      if (
        !projectForm.name ||
        !projectForm.tokenSymbol ||
        !selectedUseCase.value
      ) {
        showNotification(
          "Please fill in all required fields and select a use case",
          "warning",
        );
        return;
      }

      showNotification("Creating prediction market skill...", "info", 0);

      const result = await skillStore.publishSkill({
        name: projectForm.name,
        description:
          projectForm.description ||
          `${selectedUseCase.value.label} prediction market for ${projectForm.tokenSymbol}`,
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
        showNotification(
          `Skill "${projectForm.name}" created successfully!`,
          "success",
        );

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

      showNotification(
        `Position opened: ${positionModal.amount} tokens ${side === "for" ? "FOR" : "AGAINST"}`,
        "success",
      );
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
      if (
        !skillForm.name ||
        !skillForm.description ||
        skillForm.steps.length === 0
      ) {
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
        showNotification(
          `Skill "${skillForm.name}" published successfully!`,
          "success",
        );

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
      tokenIssuanceModal.tokenName = skill.tokenSymbol
        ? `${skill.name} Token`
        : skill.name;
      tokenIssuanceModal.tokenSymbol =
        skill.tokenSymbol || skill.name.substring(0, 4).toUpperCase();
      tokenIssuanceModal.totalSupply = skill.totalSupply || "1000000000";
      tokenIssuanceModal.initialLiquidityTokens = String(
        Math.floor(Number(tokenIssuanceModal.totalSupply) * 0.1),
      );
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
          const ethAmount =
            parseFloat(tokenIssuanceModal.initialLiquidityEth) || 0;
          const dslaAmount = tokenService.ethToDsla(ethAmount);
          tokenIssuanceModal.initialLiquidityDsla = String(
            Math.floor(dslaAmount),
          );
        }
      }
    };

    const closeTokenIssuanceModal = () => {
      tokenIssuanceModal.show = false;
      tokenIssuanceModal.skill = null;
    };

    const isDslaSkill = (skill) => {
      return skill?.category === "prediction-market" || skill?.useCase;
    };

    const hasIssuedToken = (skillId) => {
      return tokenService.hasIssuedToken(skillId);
    };

    const getSkillTokenData = (skillId) => {
      return tokenService.getTokenData(skillId);
    };

    const calculateDslaFromEth = () => {
      if (dslaEthPrice.value) {
        const ethAmount =
          parseFloat(tokenIssuanceModal.initialLiquidityEth) || 0;
        const dslaAmount = tokenService.ethToDsla(ethAmount);
        tokenIssuanceModal.initialLiquidityDsla = String(
          Math.floor(dslaAmount),
        );
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
          initialLiquidityDsla: isDsla
            ? tokenIssuanceModal.initialLiquidityDsla
            : null,
          onProgress: (progress) => {
            tokenIssuanceModal.progress = progress;
          },
        });

        if (result.success) {
          showNotification(
            `Token ${tokenIssuanceModal.tokenSymbol} issued successfully! Pool created on Uniswap.`,
            "success",
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
          modelConfig.filename,
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
        },
      );

      try {
        const success = await window.electronAPI.downloadModel(
          modelConfig.url,
          modelConfig.filename,
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

    // Lifecycle - optimized with parallel initialization
    onMounted(async () => {
      // Initialize skill store first (others may depend on it)
      await skillStore.initialize();

      // Run independent checks in parallel for faster startup
      const [, , ] = await Promise.all([
        checkModelAvailability(),
        checkPolymarketModelAvailability(),
        resumeActiveDownloadIfAny(),
      ]);

      // Non-blocking initialization
      tokenService.initialize();

      // Auto-select the featured Roleplay Companion skill by default
      const roleplaySkillId = 'roleplay-companion-v1.0.0';
      if (skillStore.getSkillById(roleplaySkillId)) {
        selectSkillById(roleplaySkillId);
      }
    });

    onBeforeUnmount(() => {
      // Clean up download socket when leaving view
      if (downloadsSocket.value?.connected) {
        try {
          downloadsSocket.value.disconnect();
        } catch {}
      }
      // Clean up all polling timers
      if (httpPollTimer) {
        clearInterval(httpPollTimer);
        httpPollTimer = null;
      }
      if (completionCheckTimer) {
        clearInterval(completionCheckTimer);
        completionCheckTimer = null;
      }
    });

    // Watch for store status updates
    watch(
      () => skillStore.runningStatus,
      (status) => {
        if (status) {
          executionStatus.value = status;
        }
      },
    );

    // Watch for skill changes to refresh model availability
    watch(selectedSkillId, async (newSkillId) => {
      if (newSkillId) {
        console.log("[SmartAgent] Skill changed to:", newSkillId);
        // Re-check model availability when skill changes
        await checkModelAvailability();
      }
    });

    // Watch for pending skill navigation from external sources (e.g., companion notification)
    // Note: removed { immediate: true } to avoid redundant execution on mount
    watch(
      () => skillStore.pendingSkillId,
      (pendingId) => {
        if (pendingId) {
          console.log("[SmartAgent] Navigating to pending skill:", pendingId);
          selectSkillById(pendingId);
          skillStore.clearPendingSkillId();
        }
      }
    );

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
      openUnlockModal,
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
      downloads,
      downloadTaskList,
      isModelReady,
      getModelTypeIcon,
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
  font-variation-settings:
    "FILL" 0,
    "wght" 100,
    "GRAD" -25,
    "opsz" 48;
  border-radius: 100%;
}

.rotating {
  animation: spin 1s linear infinite;
  will-change: transform;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
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
  background: url("../assets/bonzai_agent.webp") no-repeat;
  background-size: cover;
  filter: blur(6px);
  animation: move 40s ease infinite;
  will-change: transform;
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
  border: none;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    rgba(255, 255, 255, 1),
    transparent
  );
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
}

.category-selector {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.5em;
}

.category-selector input[type="radio"] {
  display: none;
}

.category-selector input[type="radio"] + label.radio.category {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 6px 12px;
  font-family: "Fira Sans", sans-serif !important;
  font-weight: 600 !important;
  font-size: 14px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  backdrop-filter: blur(32px);
}

.category-selector input[type="radio"] + label.radio.category:hover {
  background: rgba(97, 55, 142, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
  color: rgba(255, 255, 255, 0.8);
}

.category-selector input[type="radio"]:checked + label.radio.category {
  color: rgba(255, 255, 255, 1) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  background: rgba(97, 55, 142, 0.33) !important;
  backdrop-filter: blur(64px) !important;
}

.category-selector label.radio.category .material-symbols-outlined {
  font-size: 18px;
  margin-right: 4px;
}

/* Skills grid */
.skills-grid {
  display: flex;
  flex-direction: column;
  gap: 1em;
}

.skill-card {
  transition:
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.3s ease,
    box-shadow 0.3s ease,
    background 0.3s ease;
  transform: translateY(0);
}

.skill-card:hover {
  border-color: rgba(255, 255, 255, 0.4);
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.skill-card.is-owned {
  border-color: rgba(57, 213, 130, 0.5);
}

.skill-card.is-owned:hover {
  border-color: rgba(57, 213, 130, 0.8);
  box-shadow: 0 8px 24px rgba(57, 213, 130, 0.2);
}

.skill-card.featured {
  background: linear-gradient(
    135deg,
    rgba(155, 109, 200, 0.25) 0%,
    rgba(255, 153, 51, 0.15) 100%
  );
  border: 1px solid rgba(155, 109, 200, 0.5);
  position: relative;
  overflow: hidden;
}

.skill-card.featured::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, rgb(155, 109, 200), rgb(255, 153, 51));
  opacity: 0.8;
  transition: opacity 0.3s ease;
}

.skill-card.featured:hover {
  border-color: rgba(155, 109, 200, 0.8);
  background: linear-gradient(
    135deg,
    rgba(155, 109, 200, 0.35) 0%,
    rgba(255, 153, 51, 0.25) 100%
  );
  box-shadow: 0 8px 24px rgba(155, 109, 200, 0.25);
}

.skill-card.featured:hover::before {
  opacity: 1;
}

.skill-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5em;
}

.skill-name {
  font-size: 1.5rem;
  margin: 0;
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic;
  font-weight: 900;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
}

.has-text-brand {
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
}

.skill-description {
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 0.5em;
  text-align: left;
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
  background: linear-gradient(
    135deg,
    rgba(62, 142, 208, 0.6),
    rgba(102, 126, 234, 0.6)
  );
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

.tag.is-brand {
  color: #fff;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51));
  text-transform: uppercase;
}

/* Skill Header Banner */
.skill-header-banner {
  padding: 1.5rem;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.05),
    rgba(255, 255, 255, 0.02)
  );
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

.polymarket-category {
  font-size: 12px;
  display: flex;
  flex-wrap: nowrap;
}

.polymarket-category .radio {
  flex: 1;
  text-align: center;
  justify-content: center;
}

.timeperiod-selector,
.conviction-selector {
  font-size: 12px;
  display: flex;
  flex-wrap: nowrap;
}

.timeperiod-selector .radio,
.conviction-selector .radio {
  flex: 1;
  text-align: center;
  justify-content: center;
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
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
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

/* Investment thesis - matches GenerativeText markdown chat styling */
.investment-thesis {
  position: relative;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 1.5em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
  animation: fadeInUp 0.4s ease-out forwards;
}

.thesis-header {
  color: #3e8ed0;
  margin-bottom: 1em;
  font-size: 24px;
}

.thesis-content {
  white-space: pre-line;
  line-height: 1.6;
  font-size: 18px;
  color: #fff;
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
  font-style: normal;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.thesis-content :deep(p) {
  margin-bottom: 1em;
  text-align: justify;
}

.thesis-content :deep(ul),
.thesis-content :deep(ol) {
  margin-left: 1.5em;
  margin-bottom: 1em;
}

.thesis-content :deep(li) {
  margin-bottom: 0.5em;
}

.thesis-content :deep(strong) {
  font-weight: 700;
  color: #fff;
}

.thesis-content :deep(code) {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: monospace;
}

.thesis-content :deep(pre) {
  background: rgba(0, 0, 0, 0.4);
  padding: 1em;
  border-radius: 4px;
  overflow-x: auto;
  margin-bottom: 1em;
}

.thesis-content :deep(blockquote) {
  border-left: 3px solid #3e8ed0;
  padding-left: 1em;
  margin-left: 0;
  color: rgba(255, 255, 255, 0.8);
  font-style: italic;
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
