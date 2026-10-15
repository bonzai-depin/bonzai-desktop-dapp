<template scoped>
  <div v-if="!companyWorkflowId" class="background"></div>

  <!-- Status Notification Toast -->
  <Transition name="notification-slide">
    <div
      v-if="statusNotification.show"
      class="agent-status-toast fira-sans-condensed-black-italic"
      :class="`agent-status-toast--${statusNotification.type}`"
    >
      <span class="agent-status-toast__body">
          <span class="material-symbols-outlined" aria-hidden="true">
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
      </span>
    </div>
  </Transition>

  <div class="bz-tab-shell bz-tab-shell--agent" :class="{ 'company-workflow-runtime': companyWorkflowId }">
    <ChatLayout
      class="agent-command-center"
      :messages="[]"
      :autoscroll="false"
      :busy="isAnalyzing || isGenerating || isExecuting"
      :rail-collapsed="isAgentRailCollapsed"
      rail-label="agent workspace"
      :rail-count="agentRailItems.length"
      @toggle-rail="toggleAgentRail"
    >
      <template v-if="!companyWorkflowId && !isAgentRailCollapsed" #rail>
        <aside class="agent-command-rail" aria-label="Agent workspace navigation">
          <div class="agent-command-rail__head">
            <span class="bz-eyebrow">Menu</span>
          </div>

          <div class="agent-command-rail__section">
            <button
              v-for="item in agentRailItems"
              :key="item.value"
              type="button"
              class="agent-rail-item"
              :class="{ 'is-active': activeTab === item.value }"
              @click="selectAgentMode(item.value)"
            >
              <span class="material-symbols-outlined" aria-hidden="true">{{ item.icon }}</span>
              <span class="agent-rail-item__label">{{ item.label }}</span>
              <span v-if="item.count !== null" class="agent-rail-item__count bz-mono">{{ item.count }}</span>
            </button>
          </div>

        </aside>
      </template>

      <template #header>
        <CompanyWorkflowContext :skill-id="selectedSkillId" :task-context="companyTaskContext" :saving="savingWorkflowResult" :save-error="workflowResultError" :can-retry-save="canRetryWorkflowResult" :saved-result="savedWorkflowResult" @retry-save="retryWorkflowResult" @reviewed="handleWorkflowReviewed"
            @loaded="savedWorkflowResult = { ...savedWorkflowResult, issue: $event }" />
        <div v-if="!companyWorkflowId" class="agent-command-head">
          <div class="agent-command-head__title">
            <span class="bz-eyebrow">{{ agentModeEyebrow }}</span>
            <h1 class="bz-h1 fira-sans-condensed-black-italic">
              <span class="material-symbols-outlined bz-title-icon" aria-hidden="true">{{ agentModeIcon }}</span>
              {{ agentModeTitle }}
            </h1>
          </div>
          <div class="agent-command-head__actions">
            <button
              type="button"
              class="bz-iconbtn"
              :title="isAgentRailCollapsed ? 'Show agent rail' : 'Hide agent rail'"
              :aria-label="isAgentRailCollapsed ? 'Show agent rail' : 'Hide agent rail'"
              @click="toggleAgentRail"
            >
              <span class="material-symbols-outlined" aria-hidden="true">
                {{ isAgentRailCollapsed ? 'left_panel_open' : 'left_panel_close' }}
              </span>
            </button>
            <button type="button" class="bz-iconbtn" title="Refresh skills" aria-label="Refresh skills" @click="refreshSkills">
              <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
            </button>
          </div>
        </div>
      </template>

      <template #stream>
        <div class="agent-command-stream">
          <section class="agent-mode-surface">
          <ModeChipBar v-if="!companyWorkflowId && isAgentRailCollapsed" class="agent-mode-tabs" :model-value="activeTab" :items="agentRailItems" compact @update:model-value="selectAgentMode" />
          <!-- BROWSE AGENTS TAB -->
          <div v-if="activeTab === 'browseAgents'" class="agent-agents-view">
            <RoleplayChat
              ref="companionCreator"
              :skill="roleplayCompanion"
              management-only
              @companions-changed="refreshCompanionRoster"
              @hire-agent="hireCompanion"
              @start-roleplay="startAgentRoleplay"
            >
              <template #requirements>
                <DownloadRequirement
                  v-if="!isCompanionDemo && modelAvailabilityChecked && (hasMissingModels || downloads.active)"
                  :items="downloadRequirementItems"
                  :active="downloads.active"
                  cancellable
                  :cancelling="isCancellingDownloads"
                  @cancel="cancelActiveDownloads"
                  :progress="downloads.total_progress || downloads.progress || 0"
                  :tasks="downloadTaskList"
                  :disabled="desktopDownloadRequired"
                  :error="downloads.status === 'failed' ? $t('rcDownloads.downloadFailed') : ''"
                  @download="downloadAllMissingModels"
                />
                <p v-if="!isCompanionDemo && modelAvailabilityChecked && desktopDownloadRequired" class="bz-meta" role="status">{{ $t('rcWorkflows.desktopModelRequired') }}</p>
              </template>
            </RoleplayChat>
          </div>

          <!-- MY SKILLS TAB -->
          <div v-if="activeTab === 'my-skills' && !companyWorkflowFinished" class="agent-runner-view">
            <!-- Always show skill UI - gating happens inside the skill component -->
            <div>
              <div v-if="!isCompanionDemo && modelAvailabilityChecked && (hasMissingModels || downloads.active)" class="agent-runner-requirements">
                <DownloadRequirement
                  :items="downloadRequirementItems"
                  :active="downloads.active"
                  cancellable
                  :cancelling="isCancellingDownloads"
                  @cancel="cancelActiveDownloads"
                  :progress="downloads.total_progress || downloads.progress || 0"
                  :tasks="downloadTaskList"
                  :disabled="desktopDownloadRequired"
                  :error="downloads.status === 'failed' ? $t('rcDownloads.downloadFailed') : ''"
                  @download="downloadAllMissingModels"
                />
                <p v-if="desktopDownloadRequired" class="bz-meta" role="status">{{ $t('rcWorkflows.desktopModelRequired') }}</p>
              </div>

              <section
                v-if="!companyWorkflowId && selectedSkill && selectedSkillId !== 'roleplay-companion-v1.0.0'"
                class="agent-runner-cockpit"
                :class="'agent-runner-cockpit--' + selectedSkillProfile.tone"
              >
                <div class="agent-runner-cockpit__main">
                  <div class="agent-runner-cockpit__badge">
                    <span class="material-symbols-outlined" aria-hidden="true">{{ selectedSkillProfile.icon }}</span>
                    <span>{{ selectedSkillProfile.workspace }}</span>
                  </div>
                  <h2 class="agent-runner-cockpit__title fira-sans-condensed-black-italic">
                    {{ selectedSkill.name }}
                  </h2>
                  <p class="agent-runner-cockpit__promise">
                    {{ selectedSkillProfile.promise }}
                  </p>
                  <div class="agent-runner-pipeline" aria-label="Workflow pipeline">
                    <span
                      v-for="(step, index) in selectedSkillProfile.steps"
                      :key="step"
                      class="agent-runner-pipeline__step"
                      :class="{ 'is-active': index === selectedSkillStageIndex }"
                    >
                      <span class="bz-mono">{{ String(index + 1).padStart(2, '0') }}</span>
                      {{ step }}
                    </span>
                  </div>
                </div>

                <aside class="agent-runner-cockpit__panel" aria-label="Runner profile">
                  <div class="agent-runner-metric agent-runner-metric--hero">
                    <span>{{ selectedSkillProfile.confidenceLabel }}</span>
                    <strong class="fira-sans-condensed-black-italic">{{ selectedSkillReadiness }}</strong>
                  </div>
                  <div class="agent-runner-metric-grid">
                    <div class="agent-runner-metric">
                      <span>Mode</span>
                      <strong>{{ selectedSkillProfile.mode }}</strong>
                    </div>
                    <div class="agent-runner-metric">
                      <span>Output</span>
                      <strong>{{ selectedSkillProfile.primaryOutput }}</strong>
                    </div>
                    <div class="agent-runner-metric">
                      <span>Cadence</span>
                      <strong>{{ selectedSkillProfile.cadence }}</strong>
                    </div>
                    <div class="agent-runner-metric">
                      <span>Models</span>
                      <strong>{{ selectedSkillModelCount }}</strong>
                    </div>
                  </div>
                  <div class="agent-runner-outcomes">
                    <span
                      v-for="outcome in selectedSkillProfile.outcomes"
                      :key="outcome"
                      class="agent-runner-outcome"
                    >
                      <span class="material-symbols-outlined" aria-hidden="true">check_small</span>
                      {{ outcome }}
                    </span>
                  </div>
                </aside>
              </section>

              <!-- POLYMARKET SKILL (modular component) -->
              <div
                v-if="selectedSkillId === 'robinhood-portfolio-council-v1.0.0'"
                class="agent-skill-runtime agent-skill-runtime--flush"
              >
                <RobinhoodCouncil
                  :locked="false"
                  @result-created="captureWorkflowResult('robinhood-portfolio-council-v1.0.0', $event)"
                />
              </div>

              <!-- POLYMARKET SKILL (modular component) -->
              <div
                v-else-if="selectedSkillId === 'polymarket-top-performers-v1.0.0'"
                class="agent-skill-runtime"
              >
                <PolymarketSkill
                  :skill="selectedSkill"
                  :model-available="isModelAvailable"
                  @analyzing="isAnalyzing = $event"
                  @analysis-created="captureWorkflowResult('polymarket-top-performers-v1.0.0', $event)"
                />
              </div>

              <!-- DSLA SKILL (modular component) -->
              <div
                v-else-if="selectedSkillId === 'prediction-market-maker-v1.0.0'"
                class="agent-skill-runtime"
              >
                <DSLASkill
                  :skill="selectedSkill"
                  @market-created="handleWorkflowResult('prediction-market-maker-v1.0.0', $event, 'Market proposal prepared!')"
                />
              </div>

              <!-- MEDITATION FORGE SKILL (modular component) -->
              <div
                v-else-if="selectedSkillId === 'meditation-forge-v1.0.0'"
                class="meditation-interface agent-skill-runtime"
              >
                <MeditationForgeSkill
                  :skill="selectedSkill"
                  :model-available="isModelAvailable"
                  @meditation-created="handleWorkflowResult('meditation-forge-v1.0.0', $event, 'Meditation session created!')"
                  :company-task="companyTaskContext"
                  @status-update="loadingMessage = $event"
                />
              </div>

              <!-- VIDEO CAPTIONING SKILL (modular component) -->
              <div
                v-else-if="selectedSkillId === 'video-captioning-v1.0.0'"
                class="meditation-interface agent-skill-runtime"
              >
                <VideoCaptioningSkill
                  :skill="selectedSkill"
                  :model-available="isModelAvailable"
                  @caption-created="handleWorkflowResult('video-captioning-v1.0.0', $event, 'Video captioning session saved!')"
                  @status-update="loadingMessage = $event"
                />
              </div>

              <div
                v-else-if="selectedSkillId === 'finger-frame-director-v1.0.0'"
                class="agent-skill-runtime agent-skill-runtime--flush"
              >
                <FingerFrameSkill
                  :skill="selectedSkill"
                  @model-requirements-change="updateWorkflowModelRequirements"
                  @effect-created="handleWorkflowResult('finger-frame-director-v1.0.0', $event, 'Finger frame effect created!')"
                  @status-update="loadingMessage = $event"
                />
              </div>

              <!-- TRADING CARD GAME ANALYSIS (modular component) -->
              <div
                v-else-if="selectedSkillId === 'tcg-analysis-v1.0.0'"
                class="meditation-interface agent-skill-runtime"
              >
                <TCGScannerSkill
                  :downloads-managed="true"
                  :skill="selectedSkill"
                  :model-available="modelAvailabilityChecked && !hasMissingModels"
                  @card-scanned="handleWorkflowResult('tcg-analysis-v1.0.0', $event, 'Card analysis complete!')"
                  @status-update="loadingMessage = $event"
                />
              </div>

              <!-- LIVE STREAMER PLAYGROUND (modular component) -->
              <div
                v-else-if="selectedSkillId === 'live-streaming-v1.0.0'"
                class="meditation-interface agent-skill-runtime"
              >
                <LiveStreamerSkill
                  @model-requirements-change="updateWorkflowModelRequirements"
                  :skill="selectedSkill"
                  :model-available="isModelAvailable"
                  @result-created="captureWorkflowResult('live-streaming-v1.0.0', $event)"
                  @status-update="loadingMessage = $event"
                />
              </div>

              <!-- MASS CHAT (education skill) -->
              <div v-else-if="selectedSkillId === 'mass-chat-v1.0.0'" class="agent-skill-runtime">
                <MassChatSkill
                  :skill="selectedSkill"
                  @result-created="captureWorkflowResult('mass-chat-v1.0.0', $event)"
                  @status-update="loadingMessage = $event"
                />
              </div>

              <!-- CHART FORECASTER (finance skill) -->
              <div v-else-if="selectedSkillId === 'chart-forecaster-v1.0.0'" class="agent-skill-runtime">
                <ChartForecasterSkill
                  :skill="selectedSkill"
                  @result-created="captureWorkflowResult('chart-forecaster-v1.0.0', $event)"
                  @status-update="loadingMessage = $event"
                />
              </div>

              <!-- Roleplay Companion - Special Chat Interface -->
              <div
                v-else-if="selectedSkillId === 'roleplay-companion-v1.0.0' && selectedSkill"
                class="roleplay-interface agent-skill-runtime agent-skill-runtime--flush"
              >
                <RoleplayChat
                  :skill="selectedSkill"
                  :initial-companion="roleplayStartAgent"
                  @charge-fee="handleRoleplayFee"
                />
              </div>
            </div>
          </div>
          </section>
        </div>
      </template>

    </ChatLayout>

    <!-- Loading Overlay -->
    <div v-if="isAnalyzing || isGenerating" class="loading-overlay">
      <div class="loading-content">
        <BonzaiPulse variant="dot" />
        <p class="fira-sans-condensed-black-italic">
          {{ loadingMessage }}
        </p>
        <BonzaiPulse variant="bar" />
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
          <BzCloseButton size="md" aria-label="Close" @click="closePositionModal" />
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
            class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
            @click="confirmPosition"
            :disabled="!positionModal.amount || positionModal.amount <= 0"
          >
            <span class="material-symbols-outlined mr-2">check</span>
            Confirm Position
          </button>
          <button
            class="bz-btn bz-btn--destructive fira-sans-condensed-black-italic"
            @click="closePositionModal"
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
          <BzCloseButton size="md" aria-label="Close" @click="closeTokenIssuanceModal" />
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
          <p class="token-modal-subtitle">
            {{ tokenIssuanceModal.skill?.name }}
          </p>
        </div>

        <div class="tcg-modal-body">
          <!-- Token Identity -->
          <div class="tcg-form-section has-text-left">
            <h4 class="bz-h3 fira-sans-condensed-black-italic mb-3">
              Token Identity
            </h4>
            <div class="token-modal-grid token-modal-grid--identity">
              <div>
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
              <div>
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

            <div class="tcg-field">
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
            <h4 class="bz-h3 fira-sans-condensed-black-italic token-modal-section-title">
              <span
                class="material-symbols-outlined"
                aria-hidden="true"
              >
                water_drop
              </span>
              Initial Liquidity (Uniswap V3)
            </h4>

            <div class="token-modal-grid">
              <div>
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
                  <p class="tcg-help">
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
              <div>
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

            <div class="tcg-field">
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
              class="dsla-pool-section"
            >
              <h5 class="fira-sans-condensed-black-italic token-modal-subhead">
                <span
                  class="material-symbols-outlined"
                  aria-hidden="true"
                >
                  currency_exchange
                </span>
                DSLA Pool (Prediction Market)
              </h5>

              <div class="bz-notice bz-notice--info">
                <span class="bz-notice__icon"><span class="material-symbols-outlined" aria-hidden="true">info</span></span>
                <div class="bz-notice__body">
                <p class="bz-notice__text">
                  As a DSLA prediction market skill, an additional SKILL/DSLA
                  liquidity pool will be created.
                </p>
                </div>
              </div>

              <div class="token-modal-grid">
                <div>
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
                <div>
                  <div class="dsla-price-info">
                    <p class="tcg-help">
                      Current DSLA/ETH:
                      <span v-if="isFetchingDslaPrice" class="token-status token-status--warning">
                        Loading...
                      </span>
                      <span v-else-if="dslaEthPrice" class="token-status token-status--success">
                        {{ dslaEthPrice.toFixed(10) }} ETH
                      </span>
                      <span v-else class="token-status token-status--danger">Unavailable</span>
                    </p>
                    <p
                      v-if="dslaEthPrice && tokenIssuanceModal.startingPriceEth"
                      class="tcg-help"
                    >
                      Starting Price in DSLA:
                      <strong class="token-status token-status--info">
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
            class="issuance-progress"
          >
            <div class="bz-notice bz-notice--warning bz-notice--stacked">
              <div class="bz-notice__body">
                  <p class="bz-notice__title">
                    {{ tokenIssuanceModal.progress.message || "Processing..." }}
                  </p>
                  <p class="bz-notice__text">
                    Step {{ tokenIssuanceModal.progress.step }} of
                    {{ tokenIssuanceModal.progress.total }}
                  </p>
              </div>
              <BonzaiPulse variant="bar" :percent="(tokenIssuanceModal.progress.step / tokenIssuanceModal.progress.total) * 100 || 0" />
            </div>
          </div>

          <!-- Summary -->
          <div
            v-if="!tokenIssuanceModal.isIssuing"
            class="tcg-preview-box"
          >
            <p class="tcg-preview-text">
              <strong>{{ tokenIssuanceModal.tokenSymbol }}</strong>
              token will be created with
              <strong>
                {{ $n(Number(tokenIssuanceModal.totalSupply)) }}
              </strong>
              total supply.
              <br />
              <span class="tcg-preview-subtext">
                SKILL/ETH pool with
                {{ tokenIssuanceModal.initialLiquidityEth }} ETH liquidity
                <span
                  v-if="
                    isDslaSkill(tokenIssuanceModal.skill) &&
                    tokenIssuanceModal.initialLiquidityDsla
                  "
                >
                  + SKILL/DSLA pool with
                  {{ $n(Number(tokenIssuanceModal.initialLiquidityDsla)) }}
                  DSLA
                </span>
              </span>
            </p>
          </div>
        </div>

        <div class="tcg-modal-footer mb-5">
          <button
            class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
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
            class="bz-btn bz-btn--destructive fira-sans-condensed-black-italic"
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
import CompanyWorkflowContext from './company/CompanyWorkflowContext.vue';
import { createWorkflowResultCapture } from '../services/company/workflowResults.js';
import { createWorkflowRecovery, workflowBridgeReady, WORKFLOW_RECOVERED_MESSAGE } from '../services/company/workflowRecovery.js';
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { withTimeout } from "../utils/withTimeout.js";
import { useI18n } from "../i18n/index.js";
import VueMarkdown from "vue-markdown-render";
import axios from "axios";
import { io } from "socket.io-client";
import { useSkillStore } from "../stores/skillStore.js";
import { useWeb3Store } from "../stores/web3.store.js";
import { SKILL_CATEGORY_META } from "../skills/types.js";
import BonzaiEmptyState from "./BonzaiEmptyState.vue";
import BonzaiPulse from "./BonzaiPulse.vue";
import BzCloseButton from "./BzCloseButton.vue";
import ChatLayout from "./chat/ChatLayout.vue";
import ModeChipBar from "./generative/ModeChipBar.vue";
import polymarketAgent from "./polymarketAgent.js";
import { tokenService } from "../services/token.service.js";
import { requestOpenLevelModal } from "../services/level.service.js";
import { CONFIG } from "../config/web3.config.js";
import SkillRunner from "./skills/SkillRunner.vue";
import { cancelLocalDownloads } from '../services/downloadCancellation.js';
import RoleplayChat from "./skills/RoleplayChat.vue";
import SkillDownloader from "./skills/SkillDownloader.vue";
import PolymarketSkill from "./skills/PolymarketSkill.vue";
import DSLASkill from "./skills/DSLASkill.vue";
import MassChatSkill from "./skills/MassChatSkill.vue";
import ChartForecasterSkill from "./skills/ChartForecasterSkill.vue";
import MeditationForgeSkill from "./skills/MeditationForgeSkill.vue";
import VideoCaptioningSkill from "./skills/VideoCaptioningSkill.vue";
import FingerFrameSkill from "./skills/FingerFrameSkill.vue";
import TCGScannerSkill from "./skills/TCGScannerSkill.vue";
import LiveStreamerSkill from "./skills/LiveStreamerSkill.vue";
import { loadSmartAgents, smartAgentCatalog } from "../services/smartAgentCatalog.js";
import DownloadRequirement from "./DownloadRequirement.vue";
import RobinhoodCouncil from "./RobinhoodCouncil.vue";
import {
  getSkillModelRequirements,
  MODEL_REQUIREMENTS,
  SKILL_MODEL_REQUIREMENTS,
  roleplayCompanion,
} from "../skills/flagship.js";

// Map model type keys to content icons (matches nav menu icons)
// Ordered by level: LVL1=chat, LVL2=headphones, LVL3=image, LVL4=movie, LVL5=3d_rotation, LVL6=exercise
const MODEL_TYPE_TO_ICON = {
  llm: 'chat',
  image: 'image',
  audio: 'headphones',
  video: 'movie',
  music: 'music_note',
  vision: 'visibility',
  training: 'exercise',
  '3d': '3d_rotation',
};

// Icon order by level (LVL1 to LVL6)
const ICON_LEVEL_ORDER = ['chat', 'headphones', 'image', 'movie', '3d_rotation', 'exercise'];

/**
 * Get unique content type icons for a skill based on its model requirements
 * Returns icons ordered by their corresponding level (LVL1 first, LVL6 last)
 * Always includes 'chat' icon since all skills require LLM (LVL1)
 */
function getSkillContentIcons(skillId) {
  const modelKeys = SKILL_MODEL_REQUIREMENTS[skillId] || [];
  const icons = new Set();

  // Always include chat icon (LVL1) since all skills require LLM
  icons.add('chat');

  for (const key of modelKeys) {
    // Extract the base type from keys like 'llm_llama_3_1_8b', 'image_turbo', 'audio_quality', etc.
    const baseType = key.split('_')[0];
    const icon = MODEL_TYPE_TO_ICON[baseType];
    if (icon) {
      icons.add(icon);
    }
  }

  // Sort icons by their level order
  return Array.from(icons).sort((a, b) => {
    const orderA = ICON_LEVEL_ORDER.indexOf(a);
    const orderB = ICON_LEVEL_ORDER.indexOf(b);
    // Icons not in order list go to the end
    return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
  });
}

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const WS_DL = `${API_BASE}/downloads`;

const DEFAULT_SKILL_PROFILE = {
  tone: "studio",
  workspace: "Skill Cockpit",
  mode: "Workflow",
  promise: "Run the selected workflow with model readiness, inputs, and outputs in one operating surface.",
  icon: "terminal",
  primaryOutput: "Execution",
  cadence: "On demand",
  confidenceLabel: "Readiness",
  steps: ["Prepare", "Run", "Review", "Export"],
  outcomes: ["Local execution", "Model readiness", "Persistent history"],
};

const SKILL_RUNNER_PROFILES = {
  "roleplay-companion-v1.0.0": {
    tone: "scene",
    workspace: "Companion Studio",
    mode: "Scene Engine",
    promise: "Character memory, scene state, and multimodal replies are staged together before the conversation takes over.",
    icon: "theater_comedy",
    primaryOutput: "Text, voice, image, video",
    cadence: "Conversational",
    confidenceLabel: "Persona fidelity",
    steps: ["Cast", "Scene", "Memory", "Media"],
    outcomes: ["13 companions", "Autonomous mode", "Scene continuity"],
  },
  "polymarket-top-performers-v1.0.0": {
    tone: "signal",
    workspace: "Signal Desk",
    mode: "Whale Consensus",
    promise: "Top PnL traders are scanned for overlapping positions so agreement, conviction, and market timing are visible at a glance.",
    icon: "finance_mode",
    primaryOutput: "Copy-trading signals",
    cadence: "Market scan",
    confidenceLabel: "Conviction",
    steps: ["Rank traders", "Scan positions", "Cluster overlap", "Recommend"],
    outcomes: ["PnL leaders", "Position overlap", "Conviction filters"],
  },
  "prediction-market-maker-v1.0.0": {
    tone: "market",
    workspace: "SLA Market Foundry",
    mode: "Outcome Design",
    promise: "A measurable service condition becomes a tradable market with terms, collateral, and verification kept explicit.",
    icon: "contract",
    primaryOutput: "Prediction market",
    cadence: "Deployable terms",
    confidenceLabel: "Oracle clarity",
    steps: ["Define metric", "Set bounds", "Price risk", "Launch"],
    outcomes: ["SLA templates", "DSLA token flow", "Verifiable outcomes"],
  },
  "meditation-forge-v1.0.0": {
    tone: "wellness",
    workspace: "Session Forge",
    mode: "Guided Experience",
    promise: "A meditation scenario becomes a complete sensory session with narration, visuals, pacing, and ambience aligned.",
    icon: "self_improvement",
    primaryOutput: "Guided session",
    cadence: "Immersive run",
    confidenceLabel: "Calm fit",
    steps: ["Intention", "Scenario", "Voice", "Atmosphere"],
    outcomes: ["8 journeys", "ASMR narration", "Generated visuals"],
  },
  "video-captioning-v1.0.0": {
    tone: "caption",
    workspace: "Caption Lab",
    mode: "Vision Timeline",
    promise: "Video frames are interpreted into transcript and subtitle artifacts with source, timing, and export flow kept together.",
    icon: "closed_caption",
    primaryOutput: "SRT + transcript",
    cadence: "Frame analysis",
    confidenceLabel: "Timing quality",
    steps: ["Load source", "Analyze frames", "Sync text", "Export"],
    outcomes: ["Local files", "Direct URLs", "Accessibility-ready"],
  },
  "finger-frame-director-v1.0.0": {
    tone: "scene",
    workspace: "Finger Frame Director",
    mode: "Local VFX",
    promise: "A hand gesture becomes a tracked cinematic portal without uploading the source clip.",
    icon: "auto_awesome_motion",
    primaryOutput: "Composited video",
    cadence: "One-shot workflow",
    confidenceLabel: "Gesture lock",
    steps: ["Track hands", "Direct world", "Generate", "Composite"],
    outcomes: ["Local processing", "Preserved audio", "Perspective tracking"],
  },
  "tcg-analysis-v1.0.0": {
    tone: "grading",
    workspace: "Grading Bench",
    mode: "Collector Appraisal",
    promise: "Card identification, OCR, condition scoring, and market pricing are staged like a professional grading station.",
    icon: "style",
    primaryOutput: "Grade + price",
    cadence: "Single scan",
    confidenceLabel: "Condition signal",
    steps: ["Capture", "Identify", "Grade", "Price"],
    outcomes: ["PGT score", "Live pricing", "Multi-game support"],
  },
  "live-streaming-v1.0.0": {
    tone: "broadcast",
    workspace: "Broadcast Console",
    mode: "Chat-to-Creation",
    promise: "Audience prompts become moderated images, audio, video, and companion moments ready for stream overlays.",
    icon: "sensors",
    primaryOutput: "Live overlay assets",
    cadence: "Realtime queue",
    confidenceLabel: "Show control",
    steps: ["Connect chat", "Moderate", "Generate", "Send to OBS"],
    outcomes: ["OBS bridge", "Viewer commands", "Companion bot"],
  },
  "mass-chat-v1.0.0": {
    tone: "arena",
    workspace: "Model Arena",
    mode: "Comparative Reasoning",
    promise: "One prompt fans out across local LLMs so answer quality, latency, and model character can be compared side by side.",
    icon: "forum",
    primaryOutput: "Model comparison",
    cadence: "Sequential run",
    confidenceLabel: "Consensus",
    steps: ["Prompt", "Dispatch", "Compare", "Synthesize"],
    outcomes: ["Side-by-side answers", "Tok/s metrics", "Ask companion"],
  },
  "chart-forecaster-v1.0.0": {
    tone: "forecast",
    workspace: "Forecast Terminal",
    mode: "Time-Series Desk",
    promise: "Historical market data is transformed into forecast bands, directional narrative, and decision context.",
    icon: "monitoring",
    primaryOutput: "Forecast path",
    cadence: "Asset horizon",
    confidenceLabel: "Model fit",
    steps: ["Select asset", "Fetch history", "Forecast", "Explain"],
    outcomes: ["TimesFM 2.0", "Crypto + equities", "Narrative summary"],
  },
  "robinhood-portfolio-council-v1.0.0": {
    tone: "signal",
    workspace: "Portfolio Council",
    mode: "Policy-Gated MCP",
    promise: "A local investment team researches, challenges, previews, and executes within a mandate you control.",
    icon: "candlestick_chart",
    primaryOutput: "Reviewed decisions",
    cadence: "On demand",
    confidenceLabel: "Control",
    steps: ["Connect", "Set mandate", "Convene", "Confirm"],
    outcomes: ["Five specialist roles", "Runtime tool discovery", "Fresh trade approval"],
  },
};

export default {
  name: "SmartAgent",
  components: {
    CompanyWorkflowContext,
    VueMarkdown,
    SkillRunner,
    RoleplayChat,
    SkillDownloader,
    PolymarketSkill,
    DSLASkill,
    MassChatSkill,
    ChartForecasterSkill,
    MeditationForgeSkill,
    VideoCaptioningSkill,
    FingerFrameSkill,
    TCGScannerSkill,
    LiveStreamerSkill,
    DownloadRequirement,
    RobinhoodCouncil,
    BonzaiEmptyState,
    BonzaiPulse,
    BzCloseButton,
    ChatLayout,
    ModeChipBar,
  },
  props: {
    companyWorkflowId: { type: String, default: "" },
    companyTask: { type: Object, default: null },
  },
  emits: ['task-result-saved'],
  setup(props, { emit }) {
    // Store
    const skillStore = useSkillStore();
    const web3Store = useWeb3Store();

    // Tab state
    const activeTab = ref("browseAgents");
    const companionCreator = ref(null);
    const isCompanionDemo = new URLSearchParams(window.location.search).get("demo")?.startsWith("companion-") || false;
    const isAgentRailCollapsed = ref(true);
    const agentTabs = [
      { value: "browseAgents", label: "Agents", icon: "groups" },
      { value: "my-skills", label: "Roleplay", icon: "play_arrow" },
    ];

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

    // Skill execution state - default to Roleplay Companion for preview
    const selectedSkillId = ref("roleplay-companion-v1.0.0");
    const selectedSkill = computed(() =>
      skillStore.getSkillById(selectedSkillId.value),
    );
    const skillInputs = reactive({});
    const isExecuting = ref(false);
    const executionStatus = ref("");
    const executionResults = reactive({});

    const savingWorkflowResult = ref(false);
    const workflowResultError = ref('');
    const canRetryWorkflowResult = ref(false);
    const savedWorkflowResult = ref(null);
    const workflowCapture = createWorkflowResultCapture({
      taskContext: props.companyTask,
      recovery: createWorkflowRecovery(props.companyTask),
      save: (companyId, issueId, input) => {
        const api = window.electronAPI?.db?.issues;
        if (!workflowBridgeReady()) throw new Error(WORKFLOW_RECOVERED_MESSAGE);
        return api.saveWorkflowResult(companyId, issueId, input);
      },
      onState: state => { savingWorkflowResult.value = state.saving; workflowResultError.value = state.error; canRetryWorkflowResult.value = state.canRetry; },
      onSaved: result => { savedWorkflowResult.value = result; emit('task-result-saved', result); },
    });
    const companyTaskContext = workflowCapture.context;
    onMounted(() => workflowCapture.restore());
    const companyWorkflowFinished = computed(() => savedWorkflowResult.value?.issue?.status === 'done'
      || savedWorkflowResult.value?.issue?.execution?.steps?.some(step => step.action?.workflowId === companyTaskContext?.skillId && step.status === 'completed'));
    const captureWorkflowResult = (workflowId, result) => workflowCapture.capture(workflowId, result, selectedSkill.value?.name);
    const retryWorkflowResult = () => workflowCapture.retry();
    const handleWorkflowReviewed = issue => {
      savedWorkflowResult.value = { ...savedWorkflowResult.value, issue };
      emit('task-result-saved', issue);
    };
    const handleWorkflowResult = (workflowId, result, message) => {
      showNotification(message, 'success');
      return captureWorkflowResult(workflowId, result);
    };

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
    const isCancellingDownloads = ref(false);
    let downloadRun = 0;
    const trackedPipelines = new Set();
    const cancelledPipelines = new Set();
    const cancelActiveDownloads = async () => {
      if (isCancellingDownloads.value) return;
      isCancellingDownloads.value = true;
      downloadRun++;
      try {
        const filenames = Object.values(downloads.pipeline?.tasks || {}).filter(task => /^llm[_-]/.test(task.task_id || '') && !['completed', 'failed', 'cancelled'].includes(task.status)).map(task => task.filename);
        await cancelLocalDownloads({ filenames, pipelineIds: [...trackedPipelines], apiBase: API_BASE });
        for (const id of trackedPipelines) cancelledPipelines.add(id);
        trackedPipelines.clear();
        downloads.status = 'cancelled';
        downloads.active = false;
        downloadingModelKey.value = null;
        if (httpPollTimer) { clearInterval(httpPollTimer); httpPollTimer = null; }
        if (completionCheckTimer) { clearInterval(completionCheckTimer); completionCheckTimer = null; }
        await checkModelAvailability(true);
        await companionCreator.value?.refreshModelAvailability?.();
      } catch (error) {
        showNotification(error.message, 'danger');
      } finally { isCancellingDownloads.value = false; }
    };
    watch(() => downloads.status, async (status) => {
      if (status === 'completed') {
        // LLM downloads finish through Electron and do not emit Flask events.
        // Refresh the existing creator's own readiness before enabling Generate.
        await companionCreator.value?.refreshModelAvailability?.();
      }
    });
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

    const workflowModelOverrides = reactive({});
    const updateWorkflowModelRequirements = ({ workflowId, keys } = {}) => {
      if (workflowId !== selectedSkillId.value || !Array.isArray(keys)) return;
      workflowModelOverrides[workflowId] = keys.filter(key => MODEL_REQUIREMENTS[key]);
    };
    // Computed: Model requirements for selected skill
    const skillModelRequirements = computed(() => {
      if (!selectedSkillId.value) return [];
      // Image pipelines own their GGUF transformers. Other additional
      // files can be independent LLMs (for example, music's lyrics model).
      let requirements = getSkillModelRequirements(selectedSkillId.value).filter((model) => !['image_quality', 'image_turbo'].includes(model.parentKey));
      // Native meditation writes with the assigned worker's model, as company tasks do.
      if (selectedSkillId.value === 'meditation-forge-v1.0.0' && companyTaskContext?.llm && MODEL_REQUIREMENTS[companyTaskContext.llm]) {
        requirements = [...requirements.filter(model => model.type !== 'llm'), { key: companyTaskContext.llm, ...MODEL_REQUIREMENTS[companyTaskContext.llm] }];
      }
      const override = workflowModelOverrides[selectedSkillId.value];
      if (override) return [...requirements.filter(model => model.type === 'llm'), ...override.map(key => ({ key, ...MODEL_REQUIREMENTS[key] }))];
      // Creating a profile and portrait does not need the scene model used in chat.
      if (activeTab.value === 'browseAgents') return [
        ...requirements.filter((model) => !['image_turbo', 'image_quality', 'video_quality'].includes(model.key)),
        { key: 'image_quality', ...MODEL_REQUIREMENTS.image_quality },
      ];
      // Existing companions need scene images, not the portrait-creation pipeline.
      return selectedSkillId.value === 'roleplay-companion-v1.0.0'
        ? requirements.filter((model) => model.key !== 'image_quality')
        : requirements;
    });

    const missingModels = computed(() => {
      return skillModelRequirements.value.filter(
        (model) => !isModelReady(model),
      );
    });

    const hasMissingModels = computed(() => {
      return missingModels.value.length > 0;
    });

    const desktopDownloadRequired = computed(() => !window.electronAPI?.downloadModel
      && missingModels.value.some((model) => model.type === 'llm'));

    // Check if a model is ready/available
    const isModelReady = (model) => {
      // For LLM models, check file availability - default to NOT available until checked
      if (model.type === "llm") {
        if (!modelAvailabilityChecked.value) return false;
        return modelAvailability[model.filename] === true;
      }
      // For Flask models (diffusion/audio/video/3d/vision/forecast), check if Flask reported them as ready
      if (
        model.type === "diffusion" ||
        model.type === "audio" ||
        model.type === "video" ||
        model.type === "3d" ||
        model.type === "vision" ||
        model.type === "forecast"
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
    const modelCheckCache = new Map();
    let modelCheckRevision = 0;

    // Check model availability on mount and when skill changes
    const checkModelAvailability = async (forceRefresh = false) => {
      const requirements = [...skillModelRequirements.value];
      const key = requirements.map(model => model.filename || model.key).sort().join('|');
      const revision = ++modelCheckRevision;
      const now = Date.now();
      if (!forceRefresh && now - (modelCheckCache.get(key) || 0) < MODEL_CACHE_TTL_MS) {
        modelAvailabilityChecked.value = true;
        return;
      }
      modelAvailabilityChecked.value = false;
      if (window.electronAPI?.checkModel) {
        await Promise.all(requirements.filter(model => model.type === 'llm').map(async model => {
          let exists = false;
          try { exists = await window.electronAPI.checkModel(model.filename); } catch {}
          if (revision === modelCheckRevision) modelAvailability[model.filename] = exists;
        }));
      }
      if (revision !== modelCheckRevision) return;

      // Check Flask server readiness for diffusion/audio/video models via /pipelines/plan
      const port = window.BONZAI_SERVER_PORT || 65000;

      // Pipeline mappings: model key -> pipeline name (keys match MODEL_REQUIREMENTS)
      const pipelineMap = {
        image_standard: "image_standard",
        image_turbo: "image_turbo",
        image_quality: "image_quality",
        image_advanced: "image_quality",
        audio: "audio",
        audio_turbo: "audio_turbo",
        audio_quality: "audio_quality_persona",
        music: "music",
        music_fast: "music",
        video_fast: "video_fast",
        video_sota: "video_sota",
        video_quality: "video_quality",
        vision: "vision",
        vision_caption: "vision_caption",
        forecast_quality: "forecast",
      };

      // Check each pipeline in parallel
      const pipelineChecks = [...new Set(requirements.filter(model => model.type !== 'llm').map(model => model.key))].map(key => [key, pipelineMap[key] || key]).map(
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
                signal: AbortSignal.timeout(10000),
              },
            );
            if (revision !== modelCheckRevision) return;
            if (response.ok) {
              const data = await response.json();
              if (revision !== modelCheckRevision) return;
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
                // Flatten repos in case a model spans multiple repositories.
                const missingRepos = (data.repos || [])
                  .filter(
                    (r) =>
                      r.ok === false ||
                      (Number.isFinite(r.missing) && r.missing > 0),
                  )
                  .flatMap((r) => (Array.isArray(r.repo) ? r.repo : [r.repo])
                    .map((repo) => ({ repo, size: r.size || r.filesize || '' })));
                const missingFiles = (data.required_files || [])
                  .filter((f) => !f.ok || !f.exists)
                  .map((f) => ({ name: (f.path || f.name || "").split("/").pop(), size: f.size || f.filesize || '' }));
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
            if (revision !== modelCheckRevision) return;
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

      if (revision !== modelCheckRevision) return;
      modelAvailabilityChecked.value = true;
      modelCheckCache.set(key, Date.now());
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
      if (!p || isCancellingDownloads.value || downloads.status === 'cancelled' || cancelledPipelines.has(p.pipeline_id)) return;
      downloads.pipelineId = p.pipeline_id || downloads.pipelineId;
      downloads.status = p.status || downloads.status || "downloading";

      const existing = downloads.pipeline?.tasks || {};
      const incoming = p.tasks || {};
      const merged = { ...existing };
      for (const [tid, t] of Object.entries(incoming)) {
        merged[tid] = mergeTask(existing[tid], { ...t, pipeline: t.pipeline || p.pipeline_name || existing[tid]?.pipeline });
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
        checkModelAvailability(true);
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
      trackedPipelines.add(pipelineId);
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
      if (missing.length === 0 || desktopDownloadRequired.value || downloads.active || isCancellingDownloads.value) return;
      const run = ++downloadRun;
      const wasCancelled = () => run !== downloadRun;

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
          if (wasCancelled()) return;
          if (model.type === "llm" && model.url) {
            // LLM models via electron API
            if (window.electronAPI?.downloadModel) {
              hasActiveDownload = true;

              // Create a task entry for this LLM download
              const taskId = `llm_${model.filename}`;
              downloads.pipeline.tasks[taskId] = {
                task_id: taskId,
                category: model.type,
                filename: model.filename,
                status: "downloading",
                progress: 0,
                total_size: 0,
                downloaded_size: 0,
              };

              const progressHandler = (e, data) => {
                if (!wasCancelled() && data.filename === model.filename) {
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

              if (wasCancelled()) return;
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
            if (wasCancelled()) return;
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
                if (wasCancelled()) {
                  cancelledPipelines.add(res.data.pipeline_id);
                  await cancelLocalDownloads({ pipelineIds: [res.data.pipeline_id], apiBase: API_BASE });
                  return;
                }
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
        if (wasCancelled()) return;
        console.error("[SmartAgent] Download error:", e);
        downloads.status = "failed";
        downloads.active = false;
      } finally {
        // Reset helper state if no active downloads
        if (!wasCancelled() && !hasActiveDownload) {
          downloadingModelKey.value = null;
          downloadProgress.value = 0;
        }
      }

      // Re-check availability after downloads complete
      if (wasCancelled()) return;
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
      filesizeBytes: 4.92e9,
      parameters: 8000000000,
      context: 131072,
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
    const categoryItems = computed(() => [
      { value: "all", label: "All", icon: "apps" },
      ...categories.value.filter((cat) => skillStore.skills.some((skill) => !skill.disabled && skill.category === cat.key)).map((cat) => ({
        value: cat.key,
        label: cat.label,
        icon: cat.icon,
      })),
    ]);
    const searchQuery = computed({
      get: () => skillStore.searchQuery,
      set: (val) => skillStore.setSearchQuery(val),
    });
    const filteredSkills = computed(() => skillStore.filteredSkills);
    const marketplaceSkills = computed(() => skillStore.skills || []);
    const accessibleSkills = computed(() => skillStore.accessibleSkills);
    const downloadRequirementItems = computed(() => missingModels.value.flatMap((model) => {
      const detail = modelReadinessDetails[model.key] || {};
      const entries = [...(detail.repos || []), ...(detail.files || [])];
      const primaryNames = [model.filename || model.repo || model.name].flat();
      const knownFiles = [...primaryNames.map((name) => ({ name, size: model.size })), ...(model.additionalFiles || [])];
      return (entries.length ? entries : primaryNames).map((entry) => {
        const value = typeof entry === 'string' ? { name: entry } : entry;
        const name = value.filename || value.repo || value.name;
        const known = knownFiles.find((file) => String(file.filename || file.repo || file.name).toLowerCase() === String(name).toLowerCase());
        return { name, category: model.type, size: value.size || value.filesize || known?.size || '' };
      });
    }));
    const agentRailItems = computed(() => [
      { value: "browseAgents", label: "Smart agents", icon: "person", count: null },
      {
        value: "my-skills",
        label: "Roleplay",
        icon: "play_arrow",
        count: !isCompanionDemo && hasMissingModels.value ? missingModels.value.length : null,
      },
    ]);
    const activeAgentTab = computed(() => agentTabs.find((tab) => tab.value === activeTab.value) || agentTabs[0]);
    const agentModeEyebrow = computed(() => {
      if (activeTab.value === "browseAgents") return "Smart agents";
      if (activeTab.value === "my-skills") return "Roleplay";
      return "Automate";
    });
    const agentModeIcon = computed(() => activeAgentTab.value.icon);
    const agentModeTitle = computed(() => {
      if (activeTab.value === "browseAgents") return "Smart agents";
      if (activeTab.value === "my-skills") return selectedSkill.value?.name || "Roleplay";
      return "Workflows";
    });
    const selectedSkillProfile = computed(() => ({
      ...DEFAULT_SKILL_PROFILE,
      ...(SKILL_RUNNER_PROFILES[selectedSkillId.value] || {}),
    }));
    const selectedSkillModelCount = computed(() => skillModelRequirements.value.length || 0);
    const selectedSkillReadiness = computed(() => {
      if (isCompanionDemo) return "Ready";
      if (!modelAvailabilityChecked.value && selectedSkillModelCount.value > 0) return "Checking";
      if (hasMissingModels.value) return String(Math.max(0, selectedSkillModelCount.value - missingModels.value.length)) + "/" + selectedSkillModelCount.value;
      return selectedSkillModelCount.value > 0 ? "Ready" : "Native";
    });
    const selectedSkillStageIndex = computed(() => {
      if (downloads.active) return 0;
      if (isAnalyzing.value || isGenerating.value || isExecuting.value) return 1;
      if (executionStatus.value) return 2;
      return 0;
    });
    const isAppleSilicon = skillStore.isAppleSilicon;

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

    const toggleAgentRail = () => {
      isAgentRailCollapsed.value = !isAgentRailCollapsed.value;
    };

    const selectAgentMode = (mode) => {
      if (props.companyWorkflowId) return;
      if (!["browseAgents", "my-skills"].includes(mode)) return;
      if (mode === "browseAgents" || mode === "my-skills") selectSkillById(roleplayCompanion.id);
      activeTab.value = mode;
    };

    const refreshCompanionRoster = () => loadSmartAgents().catch(error => {
      showNotification(error.message || 'Unable to refresh smart agents', 'danger');
    });
    const roleplayStartAgent = ref(null);
    const startAgentRoleplay = companion => {
      roleplayStartAgent.value = companion;
      selectSkillById('roleplay-companion-v1.0.0');
      activeTab.value = 'my-skills';
    };
    const hireCompanion = async (companion) => {
      try {
        const companions = await loadSmartAgents();
        if (!companions.some((saved) => saved.id === companion?.id)) {
          throw new Error('This smart agent is no longer saved. Refresh the roster before adding it to a team.');
        }
        smartAgentCatalog.pendingHireId = companion.id;
        window.dispatchEvent(new CustomEvent('bonzai:hire-smart-agent', { detail: { agentId: companion.id } }));
      } catch (error) {
        showNotification(error.message || 'Unable to load this smart agent', 'danger');
      }
    };

    const getCategoryLabel = (categoryKey) => {
      return SKILL_CATEGORY_META[categoryKey]?.label || categoryKey;
    };

    const getCategoryIcon = (categoryKey) => {
      return SKILL_CATEGORY_META[categoryKey]?.icon || "extension";
    };

    const skillRequirementLabel = (skill) => {
      const access = canRunSkill(skill.id);
      if (access.canRun) return "Ready";
      return getRequiredLevel(skill) || "Locked";
    };

    const skillCompatibilityLabel = (skill) => {
      if (skill.platform?.os === "darwin") return "macOS";
      const icons = getSkillContentIcons(skill.id);
      return `${icons.length} pipeline${icons.length === 1 ? "" : "s"}`;
    };

    const skillRoiLabel = (skill) => {
      if (skill.marketplace?.roi) return skill.marketplace.roi;
      if (skill.tags?.includes("demo")) return "Demo";
      if (skill.category === "prediction-market") return "Signals";
      if (skill.category === "content") return "Assets";
      if (skill.category === "productivity") return "Time saved";
      return "Execution";
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
        beauty: "is-light",
        sports: "is-success",
        travel: "is-info",
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

    const { t } = useI18n();
    const skillsLoading = ref(false);
    const skillsLoadError = ref("");
    const clearWorkflowFilters = () => skillStore.clearFilters();
    const refreshSkills = async () => {
      if (skillsLoading.value) return;
      skillsLoading.value = true;
      skillsLoadError.value = "";
      try {
        await withTimeout(skillStore.refresh(), 10000, t("rcWorkflows.timeout"));
        if (skillStore.error) throw new Error(skillStore.error);
      } catch (error) { skillsLoadError.value = error?.message || String(error); }
      finally { skillsLoading.value = false; }
    };

    const isPreviewMode = ref(false);

    const runSkill = (skill) => {
      isPreviewMode.value = false;
      selectSkillById(skill.id);
      activeTab.value = "my-skills";
    };

    const previewSkill = (skill) => {
      isPreviewMode.value = true;
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
        activeTab.value = "browseAgents";
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
        activeTab.value = "browseAgents";
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
        filesizeBytes: modelConfig.filesizeBytes,
        parameters: modelConfig.parameters,
        context: modelConfig.context,
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
    let initialSkillsReady = false;
    let isUnmounted = false;
    const consumePendingSkill = () => {
      if (props.companyWorkflowId) return false;
      const pendingId = skillStore.pendingSkillId;
      if (!pendingId) return false;
      const skill = skillStore.getSkillById(pendingId);
      if (!skill || skill.disabled) return false;
      if (pendingId !== roleplayCompanion.id) {
        skillStore.clearPendingSkillId();
        window.dispatchEvent(new CustomEvent('bonzai:run-agent-workflow', { detail: { skillId: pendingId } }));
        return true;
      }
      runSkill(skill);
      skillStore.clearPendingSkillId();
      return true;
    };
    onMounted(async () => {
      // Refresh skill store on every mount (Agents tab re-entry)
      await refreshSkills();
      if (isUnmounted) return;
      initialSkillsReady = true;
      if (props.companyWorkflowId) { selectSkillById(props.companyWorkflowId); activeTab.value = "my-skills"; }
      const navigated = consumePendingSkill();
      if (!navigated && activeTab.value === "browseAgents") selectSkillById(roleplayCompanion.id);

      // Run independent checks in parallel for faster startup
      await Promise.all([
        checkModelAvailability(),
        ...(selectedSkillId.value === "polymarket-top-performers-v1.0.0" ? [checkPolymarketModelAvailability()] : []),
        resumeActiveDownloadIfAny(),
      ]);

      // Non-blocking initialization
      if (!isUnmounted) tokenService.initialize();
    });

    onBeforeUnmount(() => {
      isUnmounted = true;
      modelCheckRevision++;
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

    // Refresh only when the current workflow's actual requirements change.
    watch(() => skillModelRequirements.value.map(model => model.filename || model.key).join('|'), () => {
      if (initialSkillsReady) checkModelAvailability();
    });

    // Watch for pending skill navigation from external sources (e.g., companion notification)
    watch(
      () => [skillStore.pendingSkillId, skillStore.skills],
      () => { if (initialSkillsReady) consumePendingSkill(); },
    );

    return {
      companyTaskContext,
      updateWorkflowModelRequirements,
      savingWorkflowResult,
      workflowResultError,
      canRetryWorkflowResult,
      savedWorkflowResult,
      companyWorkflowFinished,
      handleWorkflowReviewed,
      captureWorkflowResult,
      retryWorkflowResult,
      handleWorkflowResult,
      roleplayCompanion,
      companionCreator,
      cancelActiveDownloads,
      isCancellingDownloads,
      refreshCompanionRoster,
      hireCompanion,
      roleplayStartAgent,
      startAgentRoleplay,
      // Tab
      activeTab,
      agentTabs,
      activeAgentTab,
      isAgentRailCollapsed,
      agentRailItems,
      downloadRequirementItems,
      desktopDownloadRequired,
      isCompanionDemo,
      agentModeEyebrow,
      agentModeIcon,
      agentModeTitle,
      selectedSkillProfile,
      selectedSkillModelCount,
      selectedSkillReadiness,
      selectedSkillStageIndex,
      toggleAgentRail,
      selectAgentMode,

      // Notifications
      statusNotification,
      showNotification,

      // Categories & Filtering
      categories,
      selectedCategory,
      categoryItems,
      setCategory,
      searchQuery,
      filteredSkills,
      marketplaceSkills,
      getCategoryLabel,
      getCategoryIcon,
      skillRequirementLabel,
      skillCompatibilityLabel,
      skillRoiLabel,
      getCategoryColor,
      formatOptionLabel,
      hasImageResults,
      extractImages,
      handleImageUpload,

      // Skills
      isAppleSilicon,
      accessibleSkills,
      canRunSkill,
      getRequiredLevel,
      getSkillContentIcons,
      openUnlockModal,
      refreshSkills, skillsLoading, skillsLoadError, clearWorkflowFilters,
      runSkill,
      previewSkill,
      isPreviewMode,
      availableSkills,
      web3Store,

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
.bz-tab-shell--agent {
  height: 100%;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.agent-command-center {
  height: 100%;
  min-height: 0;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  overflow: hidden;
  background: var(--bz-canvas);
}

.agent-command-center :deep(.bz-chat__rail) {
  width: 260px;
}

.agent-command-center :deep(.bz-chat__rail.is-collapsed) {
  width: 56px;
}

.agent-command-center :deep(.bz-chat__header),
.agent-command-center :deep(.bz-chat__input) {
  background: color-mix(in srgb, var(--bz-canvas) 92%, var(--bz-panel));
}

.agent-command-center :deep(.bz-chat__stream) {
  min-width: 0;
}

/* Company owns the page scroll. The standalone chat shell otherwise imposes
   a second fixed-height grid and traps long workflow forms inside its stream. */
.bz-tab-shell--agent.company-workflow-runtime,
.company-workflow-runtime .agent-command-center {
  height: auto;
  min-height: 0;
  overflow: visible;
}
.company-workflow-runtime .agent-command-center {
  display: block;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.company-workflow-runtime :deep(.bz-chat__main) {
  display: block;
  height: auto;
  overflow: visible;
}
.company-workflow-runtime :deep(.bz-chat__stream) {
  height: auto;
  overflow: visible;
  overscroll-behavior: auto;
}
.company-workflow-runtime :deep(.bz-chat__header) {
  padding: 0 0 var(--bz-space-5);
  border: 0;
  background: transparent;
}
.company-workflow-runtime .agent-command-stream {
  padding: 0;
}
.company-workflow-runtime .agent-skill-runtime {
  padding: 0;
  border: 0;
  background: transparent;
}

.agent-command-rail {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3);
  overflow-y: auto;
}

.agent-command-rail__head {
  padding: 0 0 var(--bz-space-3);
  border-bottom: 1px solid var(--bz-border);
}

.agent-command-rail__head .bz-eyebrow {
  margin: 0;
}

.agent-command-rail__section {
  display: grid;
  gap: var(--bz-space-2);
}

.agent-rail-item {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bz-space-2);
  padding: 0 var(--bz-space-3);
  border: 1px solid transparent;
  border-radius: var(--bz-r-sm);
  background: transparent;
  color: var(--bz-fg-mid);
  text-align: left;
  cursor: pointer;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out),
    color var(--bz-dur-fast) var(--bz-ease-out);
}

.agent-rail-item:hover,
.agent-rail-item.is-active {
  border-color: var(--bz-border-brand);
  background: var(--bz-card);
  color: var(--bz-fg);
}

.agent-rail-item .material-symbols-outlined {
  color: var(--bz-purple-300);
  font-size: 20px !important;
}

.agent-rail-item__label {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: inherit;
  font-size: var(--bz-size-body);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-rail-item__count {
  min-width: 28px;
  padding: 2px 6px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  background: var(--bz-canvas);
  color: var(--bz-fg-mid);
  font-size: 11px;
  text-align: center;
}

.agent-command-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
}

.agent-command-head__title {
  min-width: 0;
}

.agent-command-head__title .bz-eyebrow,
.agent-command-head__title h1 {
  margin: 0;
}

.agent-command-head__title .bz-eyebrow {
  display: block;
  margin-bottom: 2px;
  color: var(--bz-fg-low);
}

.agent-command-head__title h1 {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  line-height: 1.05;
}

.agent-command-head__actions {
  display: inline-flex;
  gap: var(--bz-space-2);
  flex-shrink: 0;
}

.agent-command-stream {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: var(--bz-space-4) var(--bz-space-4) var(--bz-space-6);
}

.agent-command-center :deep(.bz-chat__input) { display: none; }
.agent-workflow-search { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding: 10px 12px; border: 1px solid var(--bz-border); border-radius: var(--bz-r); background: var(--bz-panel); color: var(--bz-fg-mid); }
.agent-workflow-search:focus-within { border-color: var(--bz-accent); }
.agent-workflow-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--bz-fg); font: inherit; }
.agent-workflow-search input::placeholder { color: var(--bz-fg-mid); }

.agent-mode-surface,
.agent-mode-surface > div,
.agent-agents-view,
.agent-market,
.agent-market-grid,
.agent-runner-view,
.agent-runner-view > div,
.meditation-interface,
.roleplay-interface {
  width: 100%;
  max-width: none;
  min-width: 0;
}

.agent-command-center :deep(.browse-agents),
.agent-command-center :deep(.meditation-skill),
.agent-command-center :deep(.captioning-skill),
.agent-command-center :deep(.tcg-skill),
.agent-command-center :deep(.polymarket-skill),
.agent-command-center :deep(.dsla-skill),
.agent-command-center :deep(.mass-chat-skill),
.agent-command-center :deep(.chart-forecaster-skill),
.agent-command-center :deep(.live-streamer-skill),
.agent-command-center :deep(.roleplay-chat) {
  width: 100%;
  max-width: none;
}

.agent-command-center :deep(.bz-input__field) {
  min-height: 48px;
}

.agent-runner-requirements {
  display: grid;
  gap: var(--bz-space-2);
  width: 100%;
  min-width: 0;
  margin: 0 0 var(--bz-space-5);
}
.agent-runner-requirements :deep(.bz-download-requirement),
.agent-runner-requirements > p { margin: 0; }

.agent-runner-cockpit {
  --agent-runner-accent: var(--bz-purple-300);
  --agent-runner-soft: var(--bz-purple-soft);
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
  gap: var(--bz-space-4);
  margin-bottom: var(--bz-space-4);
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--agent-runner-accent) 12%, transparent), transparent 44%),
    color-mix(in srgb, var(--bz-card) 88%, var(--bz-canvas));
  box-shadow: inset 3px 0 0 var(--agent-runner-accent);
}

.agent-runner-cockpit--signal,
.agent-runner-cockpit--forecast,
.agent-runner-cockpit--market {
  --agent-runner-accent: var(--bz-info);
  --agent-runner-soft: var(--bz-info-soft);
}

.agent-runner-cockpit--wellness {
  --agent-runner-accent: var(--bz-emerald-300);
  --agent-runner-soft: var(--bz-emerald-soft);
}

.agent-runner-cockpit--grading {
  --agent-runner-accent: var(--bz-warning);
  --agent-runner-soft: var(--bz-warning-soft);
}

.agent-runner-cockpit--broadcast {
  --agent-runner-accent: var(--bz-purple-100);
  --agent-runner-soft: var(--bz-purple-soft);
}

.agent-runner-cockpit--caption,
.agent-runner-cockpit--arena {
  --agent-runner-accent: var(--bz-purple-300);
  --agent-runner-soft: var(--bz-purple-soft);
}

.agent-runner-cockpit__main,
.agent-runner-cockpit__panel {
  min-width: 0;
}

.agent-runner-cockpit__main {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}

.agent-runner-cockpit__badge {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  min-height: 30px;
  padding: 0 var(--bz-space-3);
  border: 1px solid color-mix(in srgb, var(--agent-runner-accent) 48%, var(--bz-border));
  border-radius: var(--bz-r-pill);
  background: var(--agent-runner-soft);
  color: var(--bz-fg);
  font-size: var(--bz-size-meta);
}

.agent-runner-cockpit__badge .material-symbols-outlined {
  color: var(--agent-runner-accent);
  font-size: 17px !important;
}

.agent-runner-cockpit__title {
  margin: 0;
  color: var(--bz-fg);
  font-size: clamp(2rem, 4vw, 3.75rem);
  line-height: 0.92;
  letter-spacing: 0;
}

.agent-runner-cockpit__promise {
  max-width: 84ch;
  margin: 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-body);
  line-height: var(--bz-line-body);
}

.agent-runner-pipeline {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--bz-space-2);
  margin-top: auto;
}

.agent-runner-pipeline__step {
  min-width: 0;
  min-height: 52px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: var(--bz-space-2) var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: color-mix(in srgb, var(--bz-panel) 88%, transparent);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
}

.agent-runner-pipeline__step .bz-mono {
  color: var(--bz-fg-low);
  font-size: 10px;
}

.agent-runner-pipeline__step.is-active {
  border-color: color-mix(in srgb, var(--agent-runner-accent) 58%, var(--bz-border));
  background: var(--agent-runner-soft);
  color: var(--bz-fg);
}

.agent-runner-cockpit__panel {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}

.agent-runner-metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bz-space-2);
}

.agent-runner-metric {
  min-width: 0;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: color-mix(in srgb, var(--bz-panel) 88%, transparent);
}

.agent-runner-metric span {
  display: block;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-micro);
  text-transform: uppercase;
}

.agent-runner-metric strong {
  display: block;
  margin-top: var(--bz-space-1);
  overflow: hidden;
  color: var(--bz-fg);
  font-size: var(--bz-size-meta);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-runner-metric--hero {
  border-color: color-mix(in srgb, var(--agent-runner-accent) 52%, var(--bz-border));
  background: var(--agent-runner-soft);
}

.agent-runner-metric--hero strong {
  color: var(--agent-runner-accent);
  font-size: clamp(2rem, 4vw, 3.25rem);
  line-height: 0.92;
}

.agent-runner-outcomes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}

.agent-runner-outcome {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
  min-height: 28px;
  padding: 0 var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  background: var(--bz-panel);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-micro);
  text-transform: uppercase;
}

.agent-runner-outcome .material-symbols-outlined {
  color: var(--agent-runner-accent);
  font-size: 16px !important;
}

.agent-skill-runtime {
  width: 100%;
  min-width: 0;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bz-panel) 82%, transparent), transparent 180px),
    var(--bz-canvas);
}

.agent-skill-runtime--flush {
  padding: 0;
  border-color: transparent;
  background: transparent;
}

.agent-skill-runtime :deep(.skill-panel) {
  border-color: var(--bz-border);
  background: color-mix(in srgb, var(--bz-card) 88%, var(--bz-canvas));
  box-shadow: none;
}


@media (max-width: 1200px) {
  .agent-runner-cockpit {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 760px) {
  .agent-runner-pipeline,
  .agent-runner-metric-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}


.material-symbols-outlined {
  font-variation-settings:
    "FILL" 0,
    "wght" 100,
    "GRAD" -25,
    "opsz" 48;
  border-radius: 100%;
}

h1.bz-h1 {
  font-size: var(--bz-size-h1) !important;
  line-height: var(--bz-line-tight);
  text-align: left;
  margin: 0;
}

.bz-screen-header .bz-title-icon {
  color: var(--bz-purple-300);
  font-size: 28px !important;
}

.bz-screen-header .bz-eyebrow {
  margin: 0;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-micro);
  line-height: 1.2;
  text-align: left;
  font-weight: 400;
}

.bz-screen-header .bz-screen-subtitle {
  margin: 0;
  max-width: 60ch;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  line-height: var(--bz-line-body);
  text-align: left;
  font-weight: 400;
}

.rotating {
  animation: bz-spin 1s linear infinite;
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
  background-size: cover;  overflow: hidden;
}

.models__deployment {
  position: relative;
  background: transparent;
  padding: 0 !important;
  margin: 0 !important;
}

.agent-workspace {
  overflow-y: auto;
  padding: var(--bz-space-5) var(--bz-space-6);
  flex: 1;
  min-height: 0;
  width: 100%;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-5);
}

.models__activity--payouts {
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r) !important;
  background: var(--bz-card);
  width: 100%;
}
.models__activity--payouts > .columns {
  margin: 0;
}
.models__activity--payouts > .columns > .column {
  padding: 0;
}

.agent-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-4);
  margin-bottom: var(--bz-space-4);
}

.agent-market {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-4);
}

.agent-market__search {
  width: min(420px, 42vw);
  min-width: 260px;
  height: 38px;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
  color: var(--bz-fg-mid);
  padding: 0 var(--bz-space-3);
}

.agent-market__search input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--bz-fg);
  font: inherit;
}

.agent-market__search input::placeholder {
  color: var(--bz-fg-faint);
}

.agent-market-grid {
  width: 100%;
  display: grid;
  gap: var(--bz-space-3);
}

.agent-market-card {
  min-width: 0;
  min-height: 128px;
  display: grid;
  grid-template-columns: minmax(320px, 1.35fr) minmax(270px, 0.85fr) minmax(236px, auto);
  grid-template-areas: "main facts actions";
  align-items: stretch;
  gap: var(--bz-space-4);
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: color-mix(in srgb, var(--bz-card) 86%, var(--bz-canvas));
}

.agent-market-card:hover {
  border-color: var(--bz-border-brand);
  background: var(--bz-card);
}

.agent-market-card.is-featured {
  border-color: var(--bz-border-brand);
  background: color-mix(in srgb, var(--bz-card) 90%, var(--bz-purple-soft));
}

.agent-market-pill--featured {
  border-color: var(--bz-border-brand);
  color: var(--bz-purple-100);
}


.agent-market-card.is-owned {
  box-shadow: inset 3px 0 0 var(--bz-success);
}

.agent-market-card__main {
  grid-area: main;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}

.agent-market-card__top {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: var(--bz-space-3);
  align-items: center;
  min-width: 0;
}

.agent-market-card__icon {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-panel);
  color: var(--bz-accent);
}

.agent-market-card__meta {
  min-width: 0;
}

.agent-market-card__meta h3 {
  margin: 0;
  color: var(--bz-fg);
  font-size: 1.25rem;
  line-height: 1.18;
  letter-spacing: 0;
  overflow-wrap: anywhere;
  word-break: normal;
  hyphens: auto;
  text-wrap: balance;
}


.agent-market-card__meta p,
.agent-market-card__description {
  margin: 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
}

.agent-market-card__description {
  line-height: var(--bz-line-body);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-market-card__facts {
  grid-area: facts;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-content: center;
  gap: var(--bz-space-2);
  margin: 0;
}

.agent-market-card__facts div {
  min-width: 0;
  height: 58px;
  padding: var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-panel);
}

.agent-market-card__facts dt {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-micro);
  text-transform: uppercase;
}

.agent-market-card__facts dd {
  margin: var(--bz-space-1) 0 0;
  color: var(--bz-fg);
  font-size: var(--bz-size-meta);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-market-card__badges,
.agent-market-card__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}

.agent-market-card__owners {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  margin-top: var(--bz-space-3);
}

.agent-market-owner {
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
}

.agent-market-owner b {
  color: var(--bz-fg);
  font-family: var(--bz-font-mono);
  font-weight: 600;
}

.agent-market-card__actions {
  grid-area: actions;
  align-self: center;
  justify-self: end;
  justify-content: flex-end;
  min-width: 236px;
}

.agent-market-card__actions .bz-btn {
  min-width: 112px;
  justify-content: center;
}

.agent-market-card__blocked,
.agent-market-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
  min-height: 28px;
  padding: 0 var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: 999px;
  color: var(--bz-fg-mid);
  background: var(--bz-panel);
  font-size: var(--bz-size-micro);
  text-transform: uppercase;
}

.agent-market-pill--success {
  color: var(--bz-success);
  border-color: color-mix(in srgb, var(--bz-success) 44%, var(--bz-border));
  background: var(--bz-success-soft);
}

@media (max-width: 1100px) {
  .agent-market-card {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "main"
      "facts"
      "actions";
    align-items: stretch;
  }
  .agent-market-card__actions {
    justify-self: stretch;
    justify-content: flex-end;
  }
}

@media (max-width: 900px) {
  .agent-topbar {
    align-items: stretch;
    flex-direction: column;
  }
  .agent-market__search {
    width: 100%;
    min-width: 0;
  }
}

.tabs a {
  color: var(--bz-fg-faint);
  border-color: var(--bz-border);
}

.tabs a:hover {
  color: var(--bz-fg);
  border-color: var(--bz-fg);
}

.tabs li.is-active a {
  color: var(--bz-warning);
  border-color: var(--bz-warning);
}

hr {
  margin: 12px 0;
  width: 100%;
  border: none;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    var(--bz-fg),
    transparent
  );
}

h1 {
  margin-top: 0 !important;
  font-size: 64px;
  color: var(--bz-fg);
  text-align: left;
}

p {
  font-size: 16px;
  color: var(--bz-fg);
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
}

.agent-status-toast {
  position: fixed;
  top: 1em;
  right: 1em;
  z-index: 50;
  max-width: min(520px, calc(100vw - 2rem));
  padding: 12px 14px;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-panel);
  color: var(--bz-fg);
  box-shadow: var(--bz-shadow-soft);
}

.agent-status-toast__body {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 1rem;
  line-height: 1.2;
}

.agent-status-toast--success { border-color: var(--bz-emerald-500); }
.agent-status-toast--danger { border-color: var(--bz-danger); }
.agent-status-toast--warning { border-color: var(--bz-warning); }

.agent-tabs {
  margin-bottom: var(--bz-space-5);
}

.agent-notice,
.agent-progress-card {
  margin: var(--bz-space-4) 0 var(--bz-space-6);
  padding: 14px 16px;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-panel);
  color: var(--bz-fg);
}

.agent-notice,
.agent-progress-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.agent-notice--danger {
  border-color: color-mix(in srgb, var(--bz-danger) 42%, var(--bz-border));
  background: var(--bz-danger-soft);
}

.agent-notice__body {
  display: grid;
  gap: 8px;
  min-width: 0;
  text-align: left;
}

.agent-notice__title,
.agent-progress-card__title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--bz-fg);
  font-size: 1.1rem;
  line-height: 1;
}

.agent-notice ul {
  margin: 0.5rem 0 0;
  padding-left: 0;
  list-style: none;
  text-transform: lowercase;
}

.agent-progress-card__pct {
  color: var(--bz-fg);
  font-size: 1.45rem;
  line-height: 1;
}

.agent-progress-card :deep(.bz-pulse-wrap--bar) {
  margin-top: 12px;
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
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  color: var(--bz-fg-faint);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.category-selector input[type="radio"] + label.radio.category:hover {
  background: var(--bz-purple-soft);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg-mid);
}

.category-selector input[type="radio"]:checked + label.radio.category {
  color: var(--bz-control-selected-fg) !important;
  border: 1px solid var(--bz-control-selected-border) !important;
  background: var(--bz-control-selected-bg) !important;
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
  border-color: var(--bz-fg-low);
  transform: translateY(-4px);
  box-shadow: 0 8px 24px var(--bz-scrim);
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

.skill-header .tags .tag {
  text-transform: uppercase;
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
  color: var(--bz-fg-mid);
  margin-bottom: 0.5em;
  text-align: left;
}

.skill-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.skill-price-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  padding: 0.35em 0.85em;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(155, 109, 200, 0.2), rgba(255, 153, 51, 0.2));
  border: 1px solid rgba(155, 109, 200, 0.45);
  position: relative;
  overflow: hidden;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

.skill-price-tag::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(135deg, rgba(155, 109, 200, 0.08), rgba(255, 153, 51, 0.08));
  opacity: 0;
  transition: opacity 0.3s ease;
}

.skill-card:hover .skill-price-tag {
  border-color: rgba(255, 153, 51, 0.7);
  box-shadow: 0 0 12px rgba(155, 109, 200, 0.25), 0 0 24px rgba(255, 153, 51, 0.1);
}

.skill-card:hover .skill-price-tag::before {
  opacity: 1;
}

.skill-price-amount {
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic;
  font-weight: 900;
  font-size: 1.15rem;
  background: linear-gradient(135deg, rgb(200, 170, 240), rgb(255, 190, 100));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}

.skill-price-currency {
  font-family: "Fira Sans", sans-serif;
  font-weight: 400;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--bz-fg-low);
  line-height: 1;
  padding-top: 0.1em;
}

/* Preview Purchase Gate */
.preview-purchase-gate {
  position: sticky;
  top: 0;
  z-index: 50;
  margin-bottom: 16px;
}

.preview-gate-content {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: rgba(255, 167, 38, 0.08);
  border: 1px solid rgba(255, 167, 38, 0.3);
  border-radius: 4px;
}

.preview-gate-icon {
  font-size: 28px;
  color: rgba(255, 167, 38, 0.7);
}

.preview-gate-desc {
  font-size: 13px;
  color: var(--bz-fg);
  margin: 0;
}

.preview-gate-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  margin-left: auto;
}

.preview-gate-actions .button {
  box-shadow: none;
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
  background: var(--bz-border);
  border: 1px solid var(--bz-border-strong);
  border-radius: 8px;
  color: var(--bz-fg-mid);
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 600;
  text-transform: capitalize;
}

.visual-selector .radio:hover {
  background: var(--bz-border-strong);
  color: var(--bz-fg);
  transform: translateY(-1px);
}

.visual-selector input[type="radio"]:checked + .radio {
  background: var(--bz-control-selected-bg);
  border-color: var(--bz-control-selected-border);
  color: var(--bz-control-selected-fg);
  box-shadow: 0 2px 8px var(--bz-purple-glow);
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
  background-color: var(--bz-border-strong);
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
  background-color: var(--bz-fg);
  transition: 0.3s;
  border-radius: 50%;
}

input:checked + .slider {
  background: linear-gradient(135deg, var(--bz-emerald-500), var(--bz-info));
}

input:checked + .slider:before {
  transform: translateX(26px);
}

/* Number Input Group */
.number-input-group .button {
  background: var(--bz-border);
  border-color: var(--bz-border-strong);
  color: var(--bz-fg);
}

.number-input-group .button:hover {
  background: var(--bz-border-strong);
}

.number-input-group .input {
  background: var(--bz-border);
  border-color: var(--bz-border-strong);
  color: var(--bz-fg);
  font-size: 1.25rem;
  font-weight: bold;
}

/* Generated Image Display */
.generated-image {
  width: 100%;
  border-radius: 8px;
  box-shadow: 0 4px 12px var(--bz-scrim);
}

.generated-image-card {
  background: var(--bz-canvas);
  border-radius: 12px;
  padding: 0.75rem;
  transition: transform 0.2s ease;
}

.generated-image-card:hover {
  transform: scale(1.02);
}

/* Scene Cards */
.scene-card {
  background: var(--bz-canvas);
  border-radius: 12px;
  padding: 1.5rem;
  border-left: 4px solid var(--bz-info);
}

/* Recipe Results */
.recipe-result .tags {
  margin-bottom: 1rem;
}

.tag.is-brand {
  color: var(--bz-fg);
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51));
  text-transform: uppercase;
}

/* Skill Header Banner */
.skill-header-banner {
  padding: 1.5rem;
  background: linear-gradient(
    135deg,
    var(--bz-canvas),
    rgba(255, 255, 255, 0.02)
  );
  border-radius: 12px;
  border: 1px solid var(--bz-border);
}

/* Input Sections */
.input-section {
  padding: 1rem 0;
  border-bottom: 1px solid var(--bz-border);
}

.input-section:last-child {
  border-bottom: none;
}

/* Results Container */
.results-container {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid var(--bz-border);
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
  background: var(--bz-border);
  border: 2px dashed var(--bz-fg-faint);
  color: var(--bz-fg-mid);
  padding: 2rem;
  transition: all 0.2s ease;
}

.image-upload-area .file-cta:hover {
  background: var(--bz-border-strong);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg);
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
  background: var(--bz-border);
  border: 1px solid var(--bz-border-strong);
  border-radius: 4px;
  color: var(--bz-fg-mid);
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 700;
}

.agent-selector .radio:hover {
  background: var(--bz-border-strong);
  color: var(--bz-fg);
}

.agent-selector input[type="radio"]:checked + .radio {
  background: var(--bz-control-selected-bg);
  border-color: var(--bz-control-selected-border);
  color: var(--bz-control-selected-fg);
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
  background: var(--bz-border);
  border: 1px solid var(--bz-border-strong);
  border-radius: 4px;
  color: var(--bz-fg-mid);
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
  background: var(--bz-border-strong);
  color: var(--bz-fg);
}

.timeperiod-selector input[type="radio"]:checked + .radio,
.conviction-selector input[type="radio"]:checked + .radio,
.usecase-selector input[type="radio"]:checked + .radio,
.collection-selector input[type="radio"]:checked + .radio,
.polymarket-category input[type="radio"]:checked + .radio {
  background: var(--bz-control-selected-bg);
  border-color: var(--bz-control-selected-border);
  color: var(--bz-control-selected-fg);
}

/* Market card */
.market-card {
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  padding: 1.5em;
}

.market-question {
  display: flex;
  align-items: flex-start;
}

/* SLA market card */
.sla-market-card {
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  padding: 1em;
}

.sla-market-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sla-preview {
  background: var(--bz-scrim);
  border-radius: 4px;
}

/* Workflow builder */
.workflow-step {
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
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
  background: var(--bz-scrim-deep);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
}

.loading-content {
  text-align: center;
  color: var(--bz-fg);
}

/* Modal styles */
.position-modal-overlay,
.tcg-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bz-scrim-deep);
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
  border: 1px solid var(--bz-border);
}

.token-modal {
  max-width: 600px;
}

.modal-divider {
  border-color: var(--bz-border);
  margin: 1.5em 0;
}

.token-issuance-section {
  padding: 1em;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
}

.dsla-pool-section {
  background: var(--bz-info-soft);
  border-radius: 8px;
  padding: 1em;
  border: 1px solid rgba(62, 142, 208, 0.3);
}

.dsla-price-info {
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-panel);
}

.token-modal-subtitle,
.tcg-help {
  margin: 0;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  line-height: 1.4;
}

.token-modal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bz-space-3);
}

.token-modal-grid--identity {
  grid-template-columns: minmax(0, 2fr) minmax(120px, 1fr);
}

.token-modal-section-title,
.token-modal-subhead {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  margin: 0 0 var(--bz-space-3);
  color: var(--bz-fg);
}

.token-modal-subhead {
  font-size: 1.05rem;
}

.dsla-pool-section,
.issuance-progress {
  display: grid;
  gap: var(--bz-space-3);
  margin-top: var(--bz-space-4);
}

.token-status--warning { color: var(--bz-warning); }
.token-status--success { color: var(--bz-emerald-300); }
.token-status--danger { color: var(--bz-danger); }
.token-status--info { color: var(--bz-info); }

.tcg-preview-subtext {
  display: block;
  margin-top: var(--bz-space-2);
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
}

@media (max-width: 720px) {
  .token-modal-grid,
  .token-modal-grid--identity {
    grid-template-columns: 1fr;
  }
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
  color: var(--bz-fg);
}

.position-market-preview,
.tcg-card-preview {
  background: var(--bz-scrim);
  border-radius: 8px;
  padding: 1em;
  margin-bottom: 1em;
}

.position-status-pill,
.tcg-status-pill {
  background: rgba(62, 142, 208, 0.3);
  padding: 0.5em 1em;
  border-radius: 20px;
  color: var(--bz-fg);
}

.position-question {
  color: var(--bz-fg);
  font-size: 1.1em;
}

.position-field,
.tcg-field {
  margin-bottom: 1em;
}

.position-label,
.tcg-label {
  color: var(--bz-fg);
  display: block;
  margin-bottom: 0.5em;
}

.position-input,
.tcg-input,
.tcg-select {
  width: 100%;
  padding: 0.75em;
  background: var(--bz-border);
  border: 1px solid var(--bz-border-strong);
  border-radius: 4px;
  color: var(--bz-fg);
  font-size: 1em;
}

.data-source-item {
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: 6px;
  padding: 0.75em;
}

.data-source-item .columns {
  margin-bottom: 0.5em;
}

.position-preview-box,
.tcg-preview-box {
  background: var(--bz-scrim);
  border-radius: 8px;
  padding: 1em;
  margin: 1em 0;
}

.position-preview-text,
.tcg-preview-text {
  color: var(--bz-fg-mid);
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
  color: var(--bz-fg);
}

/* Inputs */
.input,
.textarea,
.select select {
  color: var(--bz-fg);
  background: var(--bz-border);
  border: 1px solid var(--bz-border-strong);
  transition: 200ms ease-in;
}

.input:focus,
.textarea:focus,
.select select:focus {
  border-color: var(--bz-control-selected-border);
  box-shadow: 0 0 0 2px rgba(62, 142, 208, 0.25);
}

.no-shadow {
  box-shadow: none !important;
}

::placeholder {
  color: var(--bz-fg-faint) !important;
}

.filesize {
  padding: 5px 10px;
  font-size: 14px;
  color: var(--bz-fg);
  background: var(--bz-border-strong);
  border-radius: 4px;
}

/* Investment thesis - matches GenerativeText markdown chat styling */
.investment-thesis {
  position: relative;
  background: var(--bz-scrim);
  border-radius: 8px;
  padding: 1.5em;
  border: 1px solid var(--bz-border);
  animation: bz-rise 0.4s ease-out forwards;
}

.thesis-header {
  color: var(--bz-info);
  margin-bottom: 1em;
  font-size: 24px;
}

.thesis-content {
  white-space: pre-line;
  line-height: 1.6;
  font-size: 18px;
  color: var(--bz-fg);
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
  color: var(--bz-fg);
}

.thesis-content :deep(code) {
  background: var(--bz-border);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: monospace;
}

.thesis-content :deep(pre) {
  background: var(--bz-scrim);
  padding: 1em;
  border-radius: 4px;
  overflow-x: auto;
  margin-bottom: 1em;
}

.thesis-content :deep(blockquote) {
  border-left: 3px solid var(--bz-info);
  padding-left: 1em;
  margin-left: 0;
  color: var(--bz-fg-mid);
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

<style scoped>
.agent-mode-tabs { margin-bottom: var(--bz-space-4); }
.agent-agents-view { width: 100%; max-width: none; margin-inline: 0; overflow-x: auto; }
</style>
