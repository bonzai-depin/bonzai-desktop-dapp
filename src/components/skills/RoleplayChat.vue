<template>
  <div
    ref="roleplayChatRef"
    class="roleplay-chat"
    :class="{ 'is-fullscreen': isFullscreen }"
  >
    <!-- Setup Phase -->
    <div v-if="phase === 'setup'" class="setup-phase">
      <!-- Hidden file inputs for import -->
      <input
        ref="companionImportInput"
        type="file"
        accept=".json"
        style="display: none"
        @change="handleCompanionImport"
      />
      <input
        ref="scenarioImportInput"
        type="file"
        accept=".json"
        style="display: none"
        @change="handleScenarioImport"
      />

      <!-- Companion Selection -->
      <div class="models__activity--payouts mb-5">
        <div class="section-header">
          <h3
            class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4"
          >
            <span class="material-symbols-outlined mr-2 is-size-1">
              person_pin
            </span>
            Select Companion
          </h3>
          <div class="import-export-buttons">
            <!-- Create button always visible - generation is gated -->
            <button
              class="button is-success is-small mr-5"
              @click="openCustomCompanion"
            >
              <span
                class="material-symbols-outlined mr-2"
                style="font-size: 14px"
              >
                add
              </span>
              Create
            </button>
            <button
              class="button is-info is-small mr-5"
              @click="triggerCompanionImport"
            >
              <span
                class="material-symbols-outlined mr-2"
                style="font-size: 14px"
              >
                upload
              </span>
              Import
            </button>
            <button
              class="button is-warning is-small"
              @click="exportCompanions"
            >
              <span
                class="material-symbols-outlined mr-2"
                style="font-size: 14px"
              >
                download
              </span>
              Export
            </button>
          </div>
        </div>

        <!-- Companion Minting Guide -->
        <div class="mint-guide mt-4 mb-4">
          <h4 class="fira-sans-condensed-black-italic is-size-4">
            <span class="has-text-brand">Minting Event in Progress</span>
          </h4>
          <hr />
          <div class="mint-guide-steps has-text-left">
            <div class="mint-guide-step">
              <span
                class="material-symbols-outlined mint-guide-icon has-text-success"
              >
                add_circle
              </span>
              <div>
                <strong class="has-text-white fira-sans-condensed-black-italic">
                  Create
                </strong>
                <span class="has-text-grey-light">
                  Generate a custom companion with unique traits.
                </span>
              </div>
            </div>
            <span
              class="material-symbols-outlined mint-guide-arrow has-text-grey"
            >
              arrow_forward
            </span>
            <div class="mint-guide-step">
              <span
                class="material-symbols-outlined mint-guide-icon has-text-warning"
              >
                token
              </span>
              <div>
                <strong class="has-text-white fira-sans-condensed-black-italic">
                  Mint
                </strong>
                <span class="has-text-grey-light">
                  Turn your companion into a tradeable collectible.
                </span>
              </div>
            </div>
            <span
              class="material-symbols-outlined mint-guide-arrow has-text-grey"
            >
              arrow_forward
            </span>
            <div class="mint-guide-step">
              <span
                class="material-symbols-outlined mint-guide-icon has-text-info"
              >
                fingerprint
              </span>
              <div>
                <strong class="has-text-white fira-sans-condensed-black-italic">
                  Identify
                </strong>
                <span class="has-text-grey-light">
                  Deploy a Universal Profile for your companion.
                </span>
              </div>
            </div>
            <span
              class="material-symbols-outlined mint-guide-arrow has-text-grey"
            >
              arrow_forward
            </span>
            <div class="mint-guide-step">
              <span
                class="material-symbols-outlined mint-guide-icon has-text-primary"
              >
                rocket_launch
              </span>
              <div>
                <strong class="has-text-white fira-sans-condensed-black-italic">
                  Monetize
                </strong>
                <span class="has-text-grey-light">
                  Issue a companion token and earn passive income.
                </span>
              </div>
            </div>
          </div>
        </div>

        <hr />
        <!-- Companions (unified list - all user-created) -->
        <div v-if="!showCustomCompanion" class="companion-grid mt-5 pt-5">
          <div
            v-for="companion in companions"
            :key="companion.id"
            class="companion-card has-text-left"
            :class="{
              'is-selected': selectedCompanion?.id === companion.id,
              'has-session': getSessionInfo(companion),
            }"
            @click="selectCompanion(companion)"
          >
            <!-- Export button (top left) -->
            <button
              class="card-action-btn top-left"
              @click.stop="exportCompanion(companion)"
              title="Export companion"
            >
              <span class="material-symbols-outlined" style="font-size: 14px">
                download
              </span>
            </button>
            <!-- Delete button (top left, second) — hidden for NFT companions -->
            <button
              v-if="!companion.isNFT"
              class="card-action-btn top-left-second"
              @click.stop="deleteCompanion(companion.id)"
              title="Delete companion"
            >
              <span class="material-symbols-outlined" style="font-size: 14px">
                close
              </span>
            </button>
            <div class="companion-info">
              <h4
                class="companion-name fira-sans-condensed-black-italic is-size-4"
              >
                <span class="material-symbols-outlined">
                  {{
                    companion.gender === "male"
                      ? "male"
                      : companion.gender === "female"
                        ? "female"
                        : "smart_toy"
                  }}
                </span>
                <span class="has-text-brand">
                  {{ companion.firstName || companion.name }}
                </span>
                <span v-if="companion.familyName" class="family-name">
                  {{ companion.familyName }}
                </span>
              </h4>
              <!-- Profile picture placeholder (always shown) -->
              <div class="companion-portrait-container">
                <img
                  v-if="companion.image"
                  :src="getImageSrc(companion.image)"
                  :alt="companion.name"
                  class="companion-portrait"
                />
                <div v-else class="companion-portrait-placeholder">
                  <span
                    v-if="
                      isRegeneratingImage && regeneratingId === companion.id
                    "
                    class="material-symbols-outlined rotating"
                  >
                    progress_activity
                  </span>
                  <span v-else class="material-symbols-outlined">
                    {{
                      companion.gender === "male"
                        ? "male"
                        : companion.gender === "female"
                          ? "female"
                          : "smart_toy"
                    }}
                  </span>
                </div>
                <!-- Regenerate portrait button (only when user has access) -->
                <button
                  v-if="hasAccess"
                  class="regenerate-portrait-btn"
                  @click.stop="regenerateCompanionImage(companion)"
                  :disabled="
                    isRegeneratingImage && regeneratingId === companion.id
                  "
                  :title="
                    companion.image
                      ? 'Regenerate portrait'
                      : 'Generate portrait'
                  "
                >
                  <span
                    v-if="
                      isRegeneratingImage && regeneratingId === companion.id
                    "
                    class="material-symbols-outlined rotating"
                    style="font-size: 14px"
                  >
                    progress_activity
                  </span>
                  <span
                    v-else
                    class="material-symbols-outlined"
                    style="font-size: 14px"
                  >
                    {{ companion.image ? "refresh" : "image" }}
                  </span>
                </button>
                <!-- Generate/Regenerate voice button (only when user has access) -->
                <button
                  v-if="hasAccess"
                  class="regenerate-voice-btn"
                  @click.stop="generateCompanionVoice(companion)"
                  :disabled="
                    isGeneratingVoice && generatingVoiceId === companion.id
                  "
                  :title="
                    companion.voiceSample
                      ? 'Regenerate voice'
                      : 'Generate voice'
                  "
                >
                  <span
                    v-if="
                      isGeneratingVoice && generatingVoiceId === companion.id
                    "
                    class="material-symbols-outlined rotating"
                    style="font-size: 14px"
                  >
                    progress_activity
                  </span>
                  <span
                    v-else
                    class="material-symbols-outlined"
                    style="font-size: 14px"
                  >
                    {{ companion.voiceSample ? "refresh" : "mic" }}
                  </span>
                </button>
                <!-- Voice sample indicator -->
                <div
                  v-if="companion.voiceSample"
                  class="voice-indicator"
                  @click.stop="playVoiceSample(companion)"
                  title="Play voice sample"
                >
                  <span
                    class="material-symbols-outlined"
                    style="font-size: 12px"
                  >
                    volume_up
                  </span>
                </div>
              </div>
              <!-- NFT badge -->
              <div v-if="companion.isNFT" class="nft-badge">
                <span class="tag is-link is-light">
                  <span
                    class="material-symbols-outlined"
                    style="font-size: 12px"
                  >
                    token
                  </span>
                  NFT #{{ companion.tokenId }}
                </span>
              </div>
              <hr />
              <p class="companion-desc" style="min-height: 100px">
                {{
                  companion.shortBio ||
                  companion.description?.substring(0, 160) + "..."
                }}
              </p>
              <hr />
              <!-- Spending Profile Spider Chart -->
              <div class="spending-chart-container">
                <canvas
                  :ref="
                    (el) => {
                      if (el) spendingChartRefs[companion.id] = el;
                    }
                  "
                  :id="'spending-chart-' + companion.id"
                  width="320"
                  height="320"
                ></canvas>
              </div>
              <hr />
              <!-- Animated keyword cycling -->
              <div
                class="keyword-cycler"
                @vue:mounted="registerKeywordCard(companion.id)"
              >
                <transition name="keyword-fade" mode="out-in">
                  <span
                    :key="
                      getCurrentKeyword(companion.id, companion.personality)
                    "
                    class="keyword-item"
                  >
                    {{ getCurrentKeyword(companion.id, companion.personality) }}
                  </span>
                </transition>
              </div>

              <!-- NFT Mint Button (Custom Companions Only, requires access) -->
              <div
                v-if="companion.isCustom && hasAccess"
                class="mt-3 has-text-centered p-5"
              >
                <hr />
                <!-- Already minted - show network badge -->
                <button
                  v-if="companion.tokenId"
                  class="button is-medium is-outlined is-fullwidth mb-3"
                  :class="getMintedBadgeClass(companion)"
                  :title="getMintedBadgeTitle(companion)"
                  @click.stop="openExternal(getMintedExplorerUrl(companion))"
                >
                  <span class="material-symbols-outlined mr-1">
                    {{
                      companion.standard === "ERC-8004"
                        ? "smart_toy"
                        : "verified"
                    }}
                  </span>
                  <span
                    class="tag mr-2"
                    :class="getMintedBadgeClass(companion)"
                  >
                    {{ getMintedBadgeText(companion) }}
                  </span>
                  #{{ companion.tokenId }}
                  <!-- Show agent wallet indicator for ERC-8004 -->
                  <span
                    v-if="companion.agentWallet"
                    class="tag is-success ml-2"
                    title="Agent wallet enabled for x402 payments"
                  >
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 12px"
                    >
                      payments
                    </span>
                  </span>
                </button>

                <!-- Universal Profile (post-mint LUKSO deployment) -->
                <div v-if="companion.universalProfile" class="up-tag mt-1">
                  <a
                    class="tag is-link is-light is-small"
                    style="cursor: pointer"
                    @click.stop="
                      openExternal(
                        'https://universaleverything.io/' +
                          companion.universalProfile,
                      )
                    "
                  >
                    UP: {{ companion.universalProfile.slice(0, 8) }}...{{
                      companion.universalProfile.slice(-6)
                    }}
                  </a>
                </div>
                <button
                  v-else-if="companion.tokenId"
                  class="button is-small is-link is-outlined mt-1"
                  @click.stop="deployUPForCompanion(companion)"
                  :disabled="deployingUPForCompanionId === companion.id"
                >
                  {{
                    deployingUPForCompanionId === companion.id
                      ? "Deploying..."
                      : "Deploy UP on LUKSO"
                  }}
                </button>

                <!-- Launch Token Section (only for minted companions with agentWallet) -->
                <div
                  v-if="companion.tokenId && companion.agentWallet"
                  class="token-launch-section mt-3"
                >
                  <!-- Token already launched - show token info -->
                  <div
                    v-if="companion.tokenAddress"
                    class="notification is-success is-light p-3"
                  >
                    <div
                      class="is-flex is-align-items-center is-justify-content-space-between"
                    >
                      <div>
                        <span class="has-text-weight-bold">
                          ${{
                            companion.tokenSymbol ||
                            companion.firstName?.toUpperCase()
                          }}
                        </span>
                        <span class="is-size-7 ml-2">Token Live</span>
                      </div>
                      <div class="buttons are-small mb-0">
                        <button
                          class="button is-small is-info"
                          @click.stop="
                            openExternal(
                              getUniswapTradeUrl(companion.tokenAddress),
                            )
                          "
                          title="Trade on Uniswap"
                        >
                          <span
                            class="material-symbols-outlined"
                            style="font-size: 14px"
                          >
                            swap_horiz
                          </span>
                        </button>
                        <button
                          class="button is-small is-dark"
                          @click.stop="
                            openExternal(getBaseScanUrl(companion.tokenAddress))
                          "
                          title="View on BaseScan"
                        >
                          <span
                            class="material-symbols-outlined"
                            style="font-size: 14px"
                          >
                            open_in_new
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Token not launched - show launch button -->
                  <div v-else class="field has-addons">
                    <div class="control">
                      <input
                        v-model="tokenLaunchEthAmounts[companion.id]"
                        class="input is-small"
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="ETH"
                        style="width: 80px"
                        @click.stop
                      />
                    </div>
                    <div class="control is-expanded">
                      <button
                        class="button is-warning is-small is-fullwidth"
                        :class="{
                          'is-loading':
                            isLaunchingToken &&
                            launchingTokenCompanionId === companion.id,
                        }"
                        @click.stop="launchCompanionToken(companion)"
                        :disabled="isLaunchingToken"
                        :title="`Launch $${companion.firstName?.toUpperCase() || 'TOKEN'} with Uniswap V2 liquidity`"
                      >
                        <span
                          v-if="
                            !(
                              isLaunchingToken &&
                              launchingTokenCompanionId === companion.id
                            )
                          "
                          class="material-symbols-outlined mr-1"
                          style="font-size: 14px"
                        >
                          rocket_launch
                        </span>
                        Launch ${{
                          companion.firstName?.toUpperCase() || "TOKEN"
                        }}
                      </button>
                    </div>
                  </div>
                  <p
                    v-if="!companion.tokenAddress"
                    class="help has-text-grey-light mt-1"
                  >
                    1B supply. LP burned (unruggable). Burnable token.
                  </p>
                </div>

                <!-- Not minted - mint button or connect wallet -->
                <div v-else>
                  <!-- Connect Wallet first if not connected -->
                  <button
                    v-if="!isConnected"
                    class="button is-success is-medium is-fullwidth"
                    @click.stop="connectWallet"
                    title="Connect wallet to mint"
                  >
                    <span class="material-symbols-outlined mr-1">wallet</span>
                    Connect Wallet
                  </button>
                  <!-- Mint Button (always Base) -->
                  <button
                    v-else
                    class="button is-warning is-medium is-fullwidth"
                    :class="{
                      'is-loading':
                        isMintingNFT && mintingCompanionId === companion.id,
                    }"
                    @click.stop="mintCompanionNFT(companion)"
                    :disabled="
                      isMintingNFT && mintingCompanionId === companion.id
                    "
                    title="Mint companion NFT on Base"
                  >
                    <span
                      v-if="
                        !(isMintingNFT && mintingCompanionId === companion.id)
                      "
                      class="material-symbols-outlined mr-1"
                    >
                      token
                    </span>
                    Mint 0.25 ETH
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Custom Companion Generator -->
        <div v-if="showCustomCompanion" class="custom-companion-form mt-5 p-5">
          <div class="field">
            <div class="control">
              <textarea
                v-model="customCompanionPrompt"
                class="textarea is-large"
                placeholder="Describe your ideal companion..."
                rows="3"
              ></textarea>
            </div>
          </div>
          <div class="buttons">
            <div class="select is-medium mr-5">
              <select v-model="customCompanionGender">
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
            <div class="select is-medium mr-5">
              <select v-model="customCompanionStyle">
                <option value="openness">Openness</option>
                <option value="conscientiousness">Conscientiousness</option>
                <option value="extraversion">Extraversion</option>
                <option value="agreeableness">Agreeableness</option>
                <option value="neuroticism">Neuroticism</option>
              </select>
            </div>
            <!-- Generate button - gated by access level -->
            <template v-if="hasAccess">
              <button
                class="button is-success is-medium mt-2 mr-5"
                @click="generateCustomCompanion"
                :disabled="!customCompanionPrompt || isGenerating"
              >
                <span
                  v-if="isGenerating"
                  class="material-symbols-outlined rotating mr-1"
                >
                  progress_activity
                </span>
                <span v-else class="material-symbols-outlined mr-1">
                  magic_button
                </span>
                {{ isGenerating ? "Generating..." : "Generate" }}
              </button>
            </template>
            <button
              v-else
              class="button is-warning is-medium mt-2 mr-5 fira-sans-condensed-black-italic"
              @click="openUnlockModal"
            >
              <span
                class="material-symbols-outlined mr-1"
                style="font-size: 18px"
              >
                lock_open
              </span>
              UNLOCK LVL4
              <span
                v-for="icon in skillContentIcons"
                :key="icon"
                class="material-symbols-outlined ml-1"
                style="font-size: 16px"
              >
                {{ icon }}
              </span>
            </button>
            <button
              class="button is-danger is-medium mt-2 is-pulled-right"
              @click="cancelCustomCompanion"
            >
              Cancel
            </button>
          </div>
          <!-- Generation Error -->
          <div v-if="generationError" class="notification is-danger mt-4 mb-0">
            <button class="delete" @click="generationError = null"></button>
            <p class="is-size-7">
              <span
                class="material-symbols-outlined mr-1"
                style="font-size: 14px; vertical-align: middle"
              >
                error
              </span>
              {{ generationError }}
            </p>
          </div>
          <!-- Generated Custom Companion Preview (Progressive) -->
          <div
            v-if="customCompanion || isGenerating"
            class="custom-companion-preview mt-4 has-text-left"
          >
            <!-- Progress Status -->
            <div
              v-if="isGenerating && typingStatus"
              class="generation-status mb-3"
            >
              <span
                class="material-symbols-outlined rotating mr-2 has-text-white"
                style="font-size: 16px; vertical-align: middle"
              >
                progress_activity
              </span>
              <span class="has-text-warning is-size-7">{{ typingStatus }}</span>
            </div>

            <div class="columns is-vcentered p-5">
              <!-- Portrait image -->
              <div class="column is-narrow">
                <div class="custom-preview-portrait">
                  <img
                    v-if="customCompanion?.image"
                    :src="getImageSrc(customCompanion.image)"
                    :alt="customCompanion?.name || 'Companion'"
                    class="companion-preview-img"
                  />
                  <div
                    v-else
                    class="no-portrait"
                    :class="{
                      'skeleton-pulse': isGenerating && !customCompanion?.name,
                    }"
                  >
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 64px; opacity: 0.3"
                    >
                      {{
                        customCompanion
                          ? getAvatarIcon(
                              customCompanion.avatar,
                              customCompanion.gender,
                            )
                          : "person"
                      }}
                    </span>
                  </div>
                </div>
              </div>
              <!-- Info -->
              <div class="column p-4">
                <!-- Name -->
                <h5 class="fira-sans-condensed-black-italic is-size-4">
                  <span v-if="customCompanion?.name" class="has-text-brand">
                    {{ customCompanion.name }}
                  </span>
                  <span
                    v-else-if="isGenerating"
                    class="skeleton-text"
                    style="width: 150px; height: 28px"
                  ></span>
                </h5>

                <!-- Description -->
                <div class="mt-2">
                  <p
                    v-if="customCompanion?.description"
                    class="is-size-6 has-text-grey-light"
                  >
                    {{ customCompanion.description }}
                  </p>
                  <div v-else-if="isGenerating" class="skeleton-lines">
                    <span
                      class="skeleton-text"
                      style="width: 100%; height: 16px"
                    ></span>
                    <span
                      class="skeleton-text mt-1"
                      style="width: 80%; height: 16px"
                    ></span>
                  </div>
                </div>

                <!-- Personality Tags -->
                <div class="tags mt-3">
                  <template v-if="customCompanion?.personality">
                    <span
                      v-for="(trait, idx) in customCompanion.personality
                        .split(',')
                        .slice(0, 5)"
                      :key="idx"
                      class="tag is-warning is-small mr-1"
                      style="text-transform: capitalize"
                    >
                      {{ trait.trim() }}
                    </span>
                    <span
                      v-if="customCompanion.personality.split(',').length > 5"
                      class="tag is-dark is-small"
                    >
                      +{{ customCompanion.personality.split(",").length - 5 }}
                      more
                    </span>
                  </template>
                  <template v-else-if="isGenerating">
                    <span
                      class="skeleton-text mr-1"
                      style="width: 60px; height: 20px; border-radius: 4px"
                    ></span>
                    <span
                      class="skeleton-text mr-1"
                      style="width: 70px; height: 20px; border-radius: 4px"
                    ></span>
                    <span
                      class="skeleton-text"
                      style="width: 50px; height: 20px; border-radius: 4px"
                    ></span>
                  </template>
                </div>

                <!-- Appearance (collapsible) -->
                <details v-if="customCompanion?.appearance" class="mt-3">
                  <summary class="has-text-grey is-size-7 is-clickable">
                    <span
                      class="material-symbols-outlined mr-1"
                      style="font-size: 14px; vertical-align: middle"
                    >
                      visibility
                    </span>
                    Appearance
                  </summary>
                  <p class="is-size-7 has-text-grey-light mt-1 pl-3">
                    {{ customCompanion.appearance }}
                  </p>
                </details>

                <!-- Background (collapsible) -->
                <details v-if="customCompanion?.background" class="mt-2">
                  <summary class="has-text-grey is-size-7 is-clickable">
                    <span
                      class="material-symbols-outlined mr-1"
                      style="font-size: 14px; vertical-align: middle"
                    >
                      history_edu
                    </span>
                    Background
                  </summary>
                  <p class="is-size-7 has-text-grey-light mt-1 pl-3">
                    {{ customCompanion.background }}
                  </p>
                </details>

                <!-- Action Buttons (only when generation complete) -->
                <div
                  v-if="!isGenerating && customCompanion?.name"
                  class="buttons mt-3"
                >
                  <button
                    class="button is-success is-medium mr-3"
                    @click="useCustomCompanion"
                  >
                    <span class="material-symbols-outlined mr-2">check</span>
                    Pick
                  </button>
                  <button
                    class="button is-info is-medium mr-3"
                    @click="saveCustomCompanionToStore"
                    :disabled="isCompanionAlreadySaved(customCompanion)"
                  >
                    <span class="material-symbols-outlined mr-2">save</span>
                    {{
                      isCompanionAlreadySaved(customCompanion)
                        ? "Saved"
                        : "Save"
                    }}
                  </button>
                  <button
                    v-if="!customCompanion.image"
                    class="button is-warning is-medium"
                    @click="regenerateCompanionImage(customCompanion)"
                    :disabled="isRegeneratingImage"
                  >
                    <span
                      v-if="
                        isRegeneratingImage &&
                        regeneratingId === customCompanion.id
                      "
                      class="material-symbols-outlined rotating mr-1"
                    >
                      progress_activity
                    </span>
                    <span v-else class="material-symbols-outlined mr-1">
                      image
                    </span>
                    Portrait
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Saved Sessions & Import/Export (only shown when user has access) -->
      <div
        v-if="selectedCompanion && hasAccess"
        class="models__activity--payouts mb-5"
      >
        <div class="sessions-header">
          <h3
            class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3"
          >
            <span class="material-symbols-outlined mr-2 is-size-1">
              history
            </span>
            Roleplay Sessions with
            <span class="has-text-brand">{{ selectedCompanion.name }}</span>
          </h3>
          <div class="sessions-actions">
            <button
              class="button is-info is-small mr-5"
              @click="triggerImportSession"
            >
              <span
                class="material-symbols-outlined mr-2"
                style="font-size: 14px"
              >
                upload
              </span>
              Import
            </button>
            <button
              class="button is-warning is-small"
              @click="exportAllSessions"
              :disabled="Object.keys(savedSessions).length === 0"
            >
              <span
                class="material-symbols-outlined mr-2"
                style="font-size: 14px"
              >
                download
              </span>
              Export
            </button>
          </div>
        </div>
        <input
          ref="importInput"
          type="file"
          accept=".json"
          style="display: none"
          @change="handleImportSession"
        />
        <hr />
        <div
          v-if="companionSessions.length > 0"
          class="saved-sessions-list mt-4"
        >
          <div
            v-for="session in companionSessions"
            :key="session.key"
            class="saved-session-card"
          >
            <div class="session-info">
              <div class="session-header">
                <span
                  class="scenario-name fira-sans-condensed-black-italic mt-2"
                >
                  {{ session.scenario?.name || "Unknown Scenario" }}
                </span>
                <span class="tag is-small is-info ml-2">
                  {{ session.messageCount }} msgs
                </span>
              </div>
              <p
                class="session-meta is-size-7 has-text-grey-light has-text-left"
              >
                {{
                  contentLevels[session.settings?.contentLevel]?.label ||
                  session.settings?.contentLevel
                }}
                • {{ formatResponseMode(session.settings?.responseMode) }}
                <span v-if="session.updatedAt">
                  • {{ formatSessionDate(session.updatedAt) }}
                </span>
              </p>
            </div>
            <div class="session-actions">
              <button
                class="button is-info is-medium mr-5"
                @click="resumeSession(session.key)"
              >
                <span class="material-symbols-outlined mr-1">play_arrow</span>
                Resume
              </button>
              <button
                class="button is-warning is-medium mr-5"
                @click="exportSession(session.key)"
                title="Export session"
              >
                <span class="material-symbols-outlined">download</span>
              </button>
              <button
                class="button is-danger is-medium"
                @click="deleteSession(session.key)"
              >
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          </div>
        </div>
        <p v-else class="notification is-info has-text-white mt-3">
          No saved session with {{ selectedCompanion.name }} yet. Start a
          roleplay or import one.
        </p>
      </div>

      <!-- Scenario Selection -->
      <div class="models__activity--payouts mb-5">
        <div class="section-header">
          <h3
            class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4"
          >
            <span class="material-symbols-outlined mr-2 is-size-1">
              landscape
            </span>
            Select Scenario
          </h3>
          <div class="import-export-buttons">
            <!-- Create button always visible - generation is gated -->
            <button
              class="button is-success is-small mr-5"
              @click="openCustomScenario"
            >
              <span
                class="material-symbols-outlined mr-2"
                style="font-size: 14px"
              >
                add
              </span>
              Create
            </button>
            <button
              class="button is-info is-small mr-5"
              @click="triggerScenarioImport"
            >
              <span
                class="material-symbols-outlined mr-2"
                style="font-size: 14px"
              >
                upload
              </span>
              Import
            </button>
            <button class="button is-warning is-small" @click="exportScenarios">
              <span
                class="material-symbols-outlined mr-2"
                style="font-size: 14px"
              >
                download
              </span>
              Export
            </button>
          </div>
        </div>
        <hr />
        <!-- Scenarios (unified list - all user-created) -->
        <div v-if="!showCustomScenario" class="scenario-grid">
          <div
            v-for="scenario in scenarios"
            :key="scenario.id"
            class="scenario-card"
            :class="{
              'is-selected': selectedScenario?.id === scenario.id,
              'has-image': scenario.image,
            }"
            @click="selectScenario(scenario)"
          >
            <!-- Scenario background image -->
            <div
              v-if="scenario.image"
              class="scenario-image"
              :style="{
                backgroundImage: `url(${getImageSrc(scenario.image)})`,
              }"
            >
              <!-- Delete button -->
              <button
                class="delete-scenario-btn"
                @click.stop="deleteScenario(scenario.id)"
                title="Delete scenario"
              >
                <span class="material-symbols-outlined" style="font-size: 14px">
                  close
                </span>
              </button>
              <!-- Regenerate button overlay -->
              <button
                class="regenerate-image-btn scenario-regen"
                @click.stop="regenerateScenarioImage(scenario)"
                :disabled="
                  isRegeneratingImage && regeneratingId === scenario.id
                "
                title="Regenerate scene"
              >
                <span
                  v-if="isRegeneratingImage && regeneratingId === scenario.id"
                  class="material-symbols-outlined rotating"
                  style="font-size: 14px"
                >
                  progress_activity
                </span>
                <span
                  v-else
                  class="material-symbols-outlined"
                  style="font-size: 14px"
                >
                  refresh
                </span>
              </button>
              <!-- Export button -->
              <button
                class="export-single-btn"
                @click.stop="exportScenario(scenario)"
                title="Export scenario"
              >
                <span class="material-symbols-outlined" style="font-size: 14px">
                  download
                </span>
              </button>
            </div>
            <div v-else class="scenario-no-image">
              <span
                class="material-symbols-outlined"
                style="font-size: 48px; opacity: 0.3"
              >
                landscape
              </span>
              <!-- Delete button -->
              <button
                class="delete-scenario-btn"
                @click.stop="deleteScenario(scenario.id)"
                title="Delete scenario"
              >
                <span class="material-symbols-outlined" style="font-size: 14px">
                  close
                </span>
              </button>
              <button
                class="regenerate-image-btn"
                @click.stop="regenerateScenarioImage(scenario)"
                :disabled="
                  isRegeneratingImage && regeneratingId === scenario.id
                "
                title="Generate scene"
              >
                <span
                  v-if="isRegeneratingImage && regeneratingId === scenario.id"
                  class="material-symbols-outlined rotating"
                  style="font-size: 14px"
                >
                  progress_activity
                </span>
                <span
                  v-else
                  class="material-symbols-outlined"
                  style="font-size: 14px"
                >
                  image
                </span>
              </button>
              <!-- Export button -->
              <button
                class="export-single-btn"
                @click.stop="exportScenario(scenario)"
                title="Export scenario"
              >
                <span class="material-symbols-outlined" style="font-size: 14px">
                  download
                </span>
              </button>
            </div>
            <hr />
            <div
              class="scenario-content has-text-left p-0"
              @vue:mounted="registerKeywordCard(scenario.id)"
            >
              <h4
                class="scenario-name fira-sans-condensed-black-italic has-text-brand is-size-4"
              >
                {{ scenario.name }}
              </h4>
              <p class="scenario-desc">
                {{ scenario.description }}
              </p>
              <!-- Animated keyword cycling for mood -->
              <div class="keyword-cycler scenario-mood">
                <transition name="keyword-fade" mode="out-in">
                  <span
                    :key="getCurrentKeyword(scenario.id, scenario.mood)"
                    class="keyword-item"
                  >
                    {{ getCurrentKeyword(scenario.id, scenario.mood) }}
                  </span>
                </transition>
              </div>
            </div>
          </div>
        </div>

        <!-- Custom Scenario Generator -->
        <div v-if="showCustomScenario" class="custom-scenario-form mt-5 p-5">
          <div class="field">
            <div class="control">
              <textarea
                v-model="customScenarioPrompt"
                class="textarea is-large"
                placeholder="Describe the scenario..."
                rows="3"
              ></textarea>
            </div>
          </div>
          <div class="buttons mt-2">
            <div class="select is-medium mr-5">
              <select v-model="customScenarioMood">
                <option value="intimate">Intimate & Cozy</option>
                <option value="suspenseful">Suspenseful & Thrilling</option>
                <option value="whimsical">Whimsical & Playful</option>
                <option value="dramatic">Dramatic & Intense</option>
                <option value="serene">Serene & Peaceful</option>
                <option value="noir">Noir & Mysterious</option>
                <option value="fantastical">Fantastical & Epic</option>
                <option value="melancholic">Melancholic & Reflective</option>
              </select>
            </div>
            <!-- Generate scenario button - gated by access level -->
            <template v-if="hasAccess">
              <button
                class="button is-info is-medium mr-5"
                @click="generateCustomScenario"
                :disabled="!customScenarioPrompt || isGenerating"
              >
                <span
                  v-if="isGenerating"
                  class="material-symbols-outlined rotating mr-1"
                >
                  progress_activity
                </span>
                <span v-else class="material-symbols-outlined mr-1">
                  magic_button
                </span>
                Generate
              </button>
            </template>
            <button
              v-else
              class="button is-warning is-medium fira-sans-condensed-black-italic mr-5"
              @click="openUnlockModal"
            >
              <span
                class="material-symbols-outlined mr-1"
                style="font-size: 18px"
              >
                lock_open
              </span>
              UNLOCK LVL4
              <span
                v-for="icon in skillContentIcons"
                :key="icon"
                class="material-symbols-outlined ml-1"
                style="font-size: 16px"
              >
                {{ icon }}
              </span>
            </button>
            <button
              class="button is-danger is-medium"
              @click="cancelCustomScenario"
            >
              Cancel
            </button>
          </div>
          <!-- Generation Error -->
          <div v-if="generationError" class="notification is-danger mt-4 mb-0">
            <button class="delete" @click="generationError = null"></button>
            <p class="is-size-7">
              <span
                class="material-symbols-outlined mr-1"
                style="font-size: 14px; vertical-align: middle"
              >
                error
              </span>
              {{ generationError }}
            </p>
          </div>

          <!-- Generated Custom Scenario Preview (Progressive) -->
          <div
            v-if="customScenario || (isGenerating && showCustomScenario)"
            class="custom-scenario-preview mt-4 has-text-left"
          >
            <!-- Progress Status -->
            <div
              v-if="isGenerating && typingStatus"
              class="generation-status mb-3 mx-4 mt-3"
            >
              <span
                class="material-symbols-outlined rotating mr-2"
                style="font-size: 16px; vertical-align: middle"
              >
                progress_activity
              </span>
              <span class="has-text-warning is-size-7">{{ typingStatus }}</span>
            </div>

            <!-- Scene image -->
            <div v-if="customScenario?.image" class="custom-preview-image mb-3">
              <img
                :src="getImageSrc(customScenario.image)"
                :alt="customScenario?.name || 'Scenario'"
              />
            </div>
            <div
              v-else-if="isGenerating"
              class="custom-preview-image-placeholder mb-3"
            >
              <div
                class="skeleton-pulse"
                style="
                  width: 100%;
                  height: 200px;
                  background: rgba(97, 55, 142, 0.3);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                "
              >
                <span
                  class="material-symbols-outlined"
                  style="font-size: 48px; opacity: 0.3"
                >
                  landscape
                </span>
              </div>
            </div>
            <div class="p-4">
              <!-- Name -->
              <h5
                class="fira-sans-condensed-black-italic has-text-success is-size-4"
              >
                <span v-if="customScenario?.name">
                  {{ customScenario.name }}
                </span>
                <span
                  v-else-if="isGenerating"
                  class="skeleton-text"
                  style="width: 200px; height: 28px"
                ></span>
              </h5>

              <!-- Description -->
              <p
                v-if="customScenario?.description"
                class="is-size-7 has-text-grey mt-1"
              >
                {{ customScenario.description }}
              </p>

              <!-- Setting -->
              <div class="mt-2">
                <p
                  v-if="customScenario?.setting"
                  class="is-size-6 has-text-grey-light"
                >
                  {{
                    typeof customScenario.setting === "object"
                      ? customScenario.setting.environment
                      : customScenario.setting
                  }}
                  {{
                    typeof customScenario.setting === "object"
                      ? customScenario.setting.atmosphere
                      : ""
                  }}
                </p>
                <div v-else-if="isGenerating" class="skeleton-lines">
                  <span
                    class="skeleton-text"
                    style="width: 100%; height: 16px"
                  ></span>
                  <span
                    class="skeleton-text mt-1"
                    style="width: 70%; height: 16px"
                  ></span>
                </div>
              </div>

              <!-- Action Buttons (only when generation complete) -->
              <div
                v-if="!isGenerating && customScenario?.name"
                class="buttons mt-4"
              >
                <button
                  class="button is-success is-medium"
                  @click="useCustomScenario"
                >
                  <span class="material-symbols-outlined mr-1">check</span>
                  Pick
                </button>
                <button
                  class="button is-info is-medium mr-3"
                  @click="saveCustomScenarioToStore"
                  :disabled="isScenarioAlreadySaved(customScenario)"
                >
                  <span class="material-symbols-outlined mr-2">save</span>
                  {{
                    isScenarioAlreadySaved(customScenario) ? "Saved" : "Save"
                  }}
                </button>
                <button
                  v-if="!customScenario.image"
                  class="button is-info is-medium"
                  @click="regenerateScenarioImage(customScenario)"
                  :disabled="isRegeneratingImage"
                >
                  <span
                    v-if="
                      isRegeneratingImage &&
                      regeneratingId === customScenario.id
                    "
                    class="material-symbols-outlined rotating mr-1"
                  >
                    progress_activity
                  </span>
                  <span v-else class="material-symbols-outlined mr-1">
                    image
                  </span>
                  Generate Scene
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Settings -->
      <div class="models__activity--payouts mb-5">
        <div class="columns">
          <div class="column is-6">
            <div class="field has-text-left">
              <label
                class="label has-text-white fira-sans-condensed-black-italic is-size-3"
              >
                <span class="material-symbols-outlined mr-2 is-size-1">
                  mode_heat
                </span>
                Content Rating
              </label>
              <hr />
              <div class="control content-level-selector">
                <div
                  v-for="(config, level) in contentLevels"
                  :key="level"
                  class="content-level-option"
                  :class="{ 'is-selected': settings.contentLevel === level }"
                  @click="settings.contentLevel = level"
                >
                  <span
                    v-if="config.icon"
                    class="material-symbols-outlined content-level-icon"
                  >
                    {{ config.icon }}
                  </span>
                  <div class="content-level-text">
                    <strong>{{ config.label }}</strong>
                    <p class="is-size-7">{{ config.description }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="column is-6">
            <div class="field has-text-left">
              <label
                class="label has-text-white fira-sans-condensed-black-italic is-size-3"
              >
                <span class="material-symbols-outlined mr-2 is-size-1">
                  chat
                </span>
                Media Support
              </label>
              <hr />
              <div class="control media-selector">
                <div
                  class="media-option"
                  :class="{
                    'is-selected': settings.enableImage,
                    'is-unavailable': !isModelAvailable('image_turbo'),
                  }"
                  @click="toggleMediaOption('enableImage', 'image_turbo')"
                >
                  <span class="material-symbols-outlined media-icon">
                    image
                  </span>
                  <div class="media-option-content">
                    <strong>Image</strong>
                    <p class="is-size-7">Generate scene illustrations</p>
                  </div>
                  <span
                    v-if="
                      !isModelAvailable('image_turbo') &&
                      downloadingPipelineKey !== 'image_turbo'
                    "
                    class="tag is-small is-warning"
                  >
                    Download
                  </span>
                  <span
                    v-if="downloadingPipelineKey === 'image_turbo'"
                    class="tag is-small is-info"
                  >
                    {{ downloadProgress }}%
                  </span>
                </div>
                <div
                  class="media-option"
                  :class="{
                    'is-selected': settings.enableAudio,
                    'is-unavailable': !isModelAvailable('audio_quality'),
                  }"
                  @click="toggleMediaOption('enableAudio', 'audio_quality')"
                >
                  <span class="material-symbols-outlined media-icon">
                    headphones
                  </span>
                  <div class="media-option-content">
                    <strong>Voice</strong>
                    <p class="is-size-7">Companion speaks responses</p>
                  </div>
                  <span
                    v-if="
                      !isModelAvailable('audio_quality') &&
                      downloadingPipelineKey !== 'audio_quality'
                    "
                    class="tag is-small is-warning"
                  >
                    Download
                  </span>
                  <span
                    v-if="downloadingPipelineKey === 'audio_quality'"
                    class="tag is-small is-info"
                  >
                    {{ downloadProgress }}%
                  </span>
                </div>
                <div
                  class="media-option"
                  :class="{
                    'is-selected': settings.enableVideo,
                    'is-unavailable': !isModelAvailable('video_fast'),
                  }"
                  @click="toggleMediaOption('enableVideo', 'video_fast')"
                >
                  <span class="material-symbols-outlined media-icon">
                    movie
                  </span>
                  <div class="media-option-content">
                    <strong>Video</strong>
                    <p class="is-size-7">Animate peak emotions</p>
                  </div>
                  <span
                    v-if="
                      !isModelAvailable('video_fast') &&
                      downloadingPipelineKey !== 'video_fast'
                    "
                    class="tag is-small is-warning"
                  >
                    Download
                  </span>
                  <span
                    v-if="downloadingPipelineKey === 'video_fast'"
                    class="tag is-small is-info"
                  >
                    {{ downloadProgress }}%
                  </span>
                </div>
                <div
                  class="media-option"
                  :class="{
                    'is-selected': settings.enableVision,
                    'is-unavailable': !isModelAvailable('vision'),
                  }"
                  @click="toggleMediaOption('enableVision', 'vision')"
                >
                  <span class="material-symbols-outlined media-icon">
                    visibility
                  </span>
                  <div class="media-option-content">
                    <strong>Vision</strong>
                    <p class="is-size-7">Upload images for context</p>
                  </div>
                  <span
                    v-if="
                      !isModelAvailable('vision') &&
                      downloadingPipelineKey !== 'vision'
                    "
                    class="tag is-small is-warning"
                  >
                    Download
                  </span>
                  <span
                    v-if="downloadingPipelineKey === 'vision'"
                    class="tag is-small is-info"
                  >
                    {{ downloadProgress }}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- User Profile (global — applies to all companions and sessions) -->
        <div class="user-profile-section mt-4">
          <h4 class="fira-sans-condensed-black-italic is-size-3 mb-4">
            <span class="has-text-brand">Your Profile</span>
          </h4>
          <!-- User Info -->
          <div class="user-info">
            <div class="field">
              <div class="control">
                <textarea
                  v-model="userProfile.userDescription"
                  class="textarea"
                  placeholder="Describe yourself for scene images..."
                  rows="3"
                  @blur="saveUserProfile()"
                ></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Spending Management Section -->
      <div
        v-if="selectedCompanion && hasAccess && selectedCompanion.agentWallet"
        class="spending-management-section models__activity--payouts mb-5"
      >
        <h3
          class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4"
        >
          <span class="material-symbols-outlined mr-2 is-size-2">
            account_balance_wallet
          </span>
          {{ selectedCompanion?.name }}'s Wallet
        </h3>
        <hr />

        <div class="columns mt-4">
          <!-- Left column: Wallet & Balance -->
          <div class="column is-6">
            <!-- Wallet Card -->
            <div class="wallet-card notification is-dark">
              <div class="wallet-header">
                <span class="material-symbols-outlined">wallet</span>
                <span>Agent Wallet (Base)</span>
              </div>

              <div class="wallet-address" v-if="agentWalletAddress">
                <p class="address-label">Address</p>
                <p class="address-value">
                  {{ truncateAddress(agentWalletAddress) }}
                </p>
                <button
                  class="button is-small is-ghost"
                  @click="copyWalletAddress"
                  title="Copy address"
                >
                  <span class="material-symbols-outlined">content_copy</span>
                </button>
              </div>

              <div class="wallet-balance">
                <p class="balance-label">Balance</p>
                <p
                  class="balance-value"
                  :class="{
                    'is-low': parseFloat(agentWalletBalance || 0) < 0.001,
                  }"
                >
                  {{ agentWalletBalance || "0.000" }} ETH
                </p>
                <button
                  class="button is-small is-info is-outlined"
                  @click="refreshAgentWalletBalance"
                  :disabled="isRefreshingBalance"
                >
                  <span
                    v-if="isRefreshingBalance"
                    class="material-symbols-outlined rotating"
                  >
                    progress_activity
                  </span>
                  <span v-else class="material-symbols-outlined">refresh</span>
                </button>
              </div>

              <p
                v-if="parseFloat(agentWalletBalance || 0) < 0.001"
                class="is-size-7 has-text-warning mt-2"
              >
                <span
                  class="material-symbols-outlined"
                  style="font-size: 12px; vertical-align: middle"
                >
                  info
                </span>
                Low balance - send ETH to fund purchases
              </p>
            </div>

            <!-- Daily Spending Stats -->
            <div class="spending-stats notification is-dark mt-3">
              <div class="spending-stats-header">
                <span class="material-symbols-outlined">trending_up</span>
                <span>Today's Spending</span>
              </div>

              <div class="spending-progress">
                <div class="progress-bar-container">
                  <div
                    class="progress-bar-fill"
                    :style="{ width: dailySpendingPercentage + '%' }"
                    :class="{
                      'is-warning': dailySpendingPercentage > 75,
                      'is-danger': dailySpendingPercentage >= 100,
                    }"
                  ></div>
                </div>
                <div class="spending-amounts">
                  <span class="spent-amount">
                    {{ dailySpentAmount.toFixed(6) }} ETH
                  </span>
                  <span class="limit-amount">
                    / {{ settings.autonomous.dailySpendingLimit }} ETH
                  </span>
                </div>
              </div>

              <p
                v-if="dailySpendingPercentage >= 100"
                class="is-size-7 has-text-danger mt-2"
              >
                Daily limit reached - no more purchases today
              </p>
            </div>
          </div>

          <!-- Right column: Spending Limits & Preferences -->
          <div class="column is-6">
            <!-- Spending Limits -->
            <div class="spending-limits notification is-dark">
              <div class="spending-limits-header">
                <span class="material-symbols-outlined">tune</span>
                <span>Spending Controls</span>
              </div>

              <!-- Enable Purchases Toggle -->
              <div class="field mb-3">
                <label class="checkbox has-text-grey-light">
                  <input
                    type="checkbox"
                    v-model="settings.autonomous.enablePurchases"
                  />
                  <span class="ml-2">Allow purchases from recommendations</span>
                </label>
              </div>

              <!-- Max per Transaction -->
              <div
                class="field mb-3"
                v-if="settings.autonomous.enablePurchases"
              >
                <label class="label has-text-grey-light is-size-7">
                  Max per transaction
                </label>
                <div class="control">
                  <div class="select is-small is-fullwidth">
                    <select v-model="settings.autonomous.maxPurchaseAmount">
                      <option value="0.0005">0.0005 ETH (~$1)</option>
                      <option value="0.001">0.001 ETH (~$2)</option>
                      <option value="0.0025">0.0025 ETH (~$5)</option>
                      <option value="0.005">0.005 ETH (~$10)</option>
                      <option value="0.01">0.01 ETH (~$20)</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Daily Limit -->
              <div
                class="field mb-3"
                v-if="settings.autonomous.enablePurchases"
              >
                <label class="label has-text-grey-light is-size-7">
                  Daily spending limit
                </label>
                <div class="control">
                  <div class="select is-small is-fullwidth">
                    <select v-model="settings.autonomous.dailySpendingLimit">
                      <option value="0.001">0.001 ETH (~$2)</option>
                      <option value="0.005">0.005 ETH (~$10)</option>
                      <option value="0.01">0.01 ETH (~$20)</option>
                      <option value="0.025">0.025 ETH (~$50)</option>
                      <option value="0.05">0.05 ETH (~$100)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <!-- Transaction History Preview -->
            <div class="tx-history-preview notification is-dark mt-3">
              <div class="tx-history-header">
                <span class="material-symbols-outlined">receipt_long</span>
                <span>Recent Transactions</span>
                <button
                  class="button is-small is-ghost"
                  @click="showTransactionHistory = true"
                >
                  View All
                </button>
              </div>

              <div
                v-if="transactionHistory && transactionHistory.length > 0"
                class="tx-list"
              >
                <div
                  v-for="tx in transactionHistory.slice(0, 3)"
                  :key="tx.timestamp"
                  class="tx-item"
                >
                  <span class="tx-type">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 14px"
                    >
                      {{
                        tx.type === "purchase_intent_approved"
                          ? "shopping_cart"
                          : "send"
                      }}
                    </span>
                  </span>
                  <span class="tx-details">
                    {{ tx.item || tx.service || "Payment" }}
                  </span>
                  <span class="tx-amount">
                    {{ tx.amountEth || tx.estimatedCost || "--" }}
                  </span>
                </div>
              </div>
              <p v-else class="is-size-7 has-text-grey-light has-text-centered">
                No transactions yet
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Autonomous Mode Integration (only shown when user has access) -->
      <div
        v-if="selectedCompanion && hasAccess"
        class="models__activity--payouts mb-5"
      >
        <h3
          class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4"
        >
          <span class="material-symbols-outlined mr-2 is-size-2">autoplay</span>
          Away Mode
        </h3>
        <hr />

        <div class="columns mt-4 is-multiline">
          <!-- Left column: Timing Settings -->
          <div class="column is-12">
            <div class="field has-text-left">
              <label
                class="label has-text-white is-size-5 mb-3 fira-sans-condensed-black-italic"
              >
                <span class="has-text-brand">Heartbeat Settings</span>
              </label>

              <!-- Idle Timeout -->
              <div class="field mb-4">
                <label class="label has-text-grey-light is-size-7">
                  You will be marked as away after :
                </label>
                <div class="control">
                  <div class="select is-medium is-fullwidth">
                    <select v-model.number="settings.autonomous.idleTimeout">
                      <option :value="1">1 minute</option>
                      <option :value="3">3 minutes</option>
                      <option :value="5">5 minutes (default)</option>
                      <option :value="10">10 minutes</option>
                      <option :value="15">15 minutes</option>
                      <option :value="30">30 minutes</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Message Interval -->
              <div class="field mb-4">
                <label class="label has-text-grey-light is-size-7">
                  Your companion will post every :
                </label>
                <div class="control">
                  <div class="select is-medium is-fullwidth">
                    <select
                      v-model.number="settings.autonomous.messageInterval"
                    >
                      <option :value="5">5 minutes</option>
                      <option :value="10">10 minutes</option>
                      <option :value="15">15 minutes (default)</option>
                      <option :value="30">30 minutes</option>
                      <option :value="60">1 hour</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Max Autonomous Messages -->
              <div class="field mb-5">
                <label class="label has-text-grey-light is-size-7">
                  Max Messages (before auto mode stops)
                </label>
                <div class="control">
                  <div class="select is-medium is-fullwidth">
                    <select v-model.number="settings.autonomous.maxMessages">
                      <option :value="6">6 messages</option>
                      <option :value="12">12 messages (default)</option>
                      <option :value="24">24 messages</option>
                      <option :value="48">48 messages</option>
                      <option :value="999">Unlimited</option>
                    </select>
                  </div>
                </div>
              </div>

              <hr />

              <!-- x402 Autonomous Purchases Section -->
              <label
                class="label has-text-white is-size-5 mb-3 mt-5 fira-sans-condensed-black-italic"
              >
                <span class="has-text-brand">Autonomous Purchases</span>
              </label>

              <!-- Enable Autonomous Purchases -->
              <div class="field mb-4">
                <label class="checkbox has-text-grey-light is-size-7">
                  <input
                    type="checkbox"
                    v-model="settings.autonomous.enablePurchases"
                  />
                  <span class="ml-2">Enable Autonomous Purchases</span>
                </label>
                <p class="help has-text-grey is-size-7 mt-1">
                  Allow companion to make x402 payments from their agent wallet
                </p>
              </div>

              <!-- Max Purchase Amount -->
              <div
                class="field mb-4"
                v-if="settings.autonomous.enablePurchases"
              >
                <label
                  class="is-size-7 has-text-grey-light mb-2 fira-sans-condensed-black-italic"
                >
                  Max per Transaction (ETH)
                </label>
                <div class="control mt-3">
                  <div class="select is-medium is-fullwidth">
                    <select v-model="settings.autonomous.maxPurchaseAmount">
                      <option value="0.0005">0.0005 ETH (~$1)</option>
                      <option value="0.001">0.001 ETH (~$2, default)</option>
                      <option value="0.0025">0.0025 ETH (~$5)</option>
                      <option value="0.005">0.005 ETH (~$10)</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Daily Spending Limit -->
              <div
                class="field mb-4"
                v-if="settings.autonomous.enablePurchases"
              >
                <label
                  class="is-size-7 has-text-grey-light mb-2 fira-sans-condensed-black-italic"
                >
                  Daily Spending Limit (ETH)
                </label>
                <div class="control mt-3">
                  <div class="select is-medium is-fullwidth">
                    <select v-model="settings.autonomous.dailySpendingLimit">
                      <option value="0.001">0.001 ETH (~$2)</option>
                      <option value="0.005">0.005 ETH (~$10, default)</option>
                      <option value="0.01">0.01 ETH (~$20)</option>
                      <option value="0.025">0.025 ETH (~$50)</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Purchase Mode -->
              <div
                class="field mb-4"
                v-if="settings.autonomous.enablePurchases"
              >
                <label
                  class="is-size-7 has-text-grey-light mb-2 fira-sans-condensed-black-italic"
                >
                  Purchase Mode
                </label>
                <div class="control mt-3">
                  <div class="select is-medium is-fullwidth">
                    <select v-model="settings.autonomous.purchaseMode">
                      <option value="default">
                        Default (all sellers equally)
                      </option>
                      <option value="specialized">
                        Specialized (weighted by spending profile)
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Seller Registry Panel -->
              <div
                v-if="settings.autonomous.enablePurchases"
                class="notification is-dark p-3 mb-4"
              >
                <p
                  class="is-size-7 has-text-grey-light mb-2 fira-sans-condensed-black-italic"
                >
                  Seller Registry
                </p>
                <div
                  v-for="seller in registrySellers"
                  :key="seller.id"
                  class="is-flex is-align-items-center is-justify-content-space-between mb-2"
                  style="gap: 8px"
                >
                  <label
                    class="checkbox has-text-grey-light is-size-7"
                    style="flex: 1"
                  >
                    <input
                      type="checkbox"
                      :checked="seller.enabled"
                      @change="
                        toggleSellerEnabled(seller.id, $event.target.checked)
                      "
                    />
                    <span class="ml-2">{{ seller.name }}</span>
                    <span class="tag is-dark is-size-7 ml-1">
                      {{ seller.category }}
                    </span>
                  </label>
                  <button
                    v-if="!seller.builtin"
                    class="delete is-small"
                    @click="removeCustomSeller(seller.id)"
                    title="Remove custom seller"
                  ></button>
                </div>

                <!-- Add Custom Seller Form -->
                <details class="mt-3">
                  <summary
                    class="is-size-7 has-text-info"
                    style="cursor: pointer"
                  >
                    Add Custom Merchant
                  </summary>
                  <div class="mt-2">
                    <div class="field mb-2 column is-6 p-0">
                      <input
                        class="input is-small"
                        v-model="newCustomSeller.name"
                        placeholder="Merchant Name"
                      />
                    </div>
                    <div class="field mb-2 column is-6 p-0">
                      <input
                        class="input is-small"
                        v-model="newCustomSeller.endpoint"
                        placeholder="Sale Endpoint (x402)"
                      />
                    </div>
                    <div class="field column is-6 p-0 pb-5">
                      <div class="select is-small">
                        <select v-model="newCustomSeller.category">
                          <option
                            v-for="cat in [
                              'beauty',
                              'education',
                              'entertainment',
                              'fashion',
                              'finance',
                              'food',
                              'healthcare',
                              'housing',
                              'reading',
                              'social',
                              'sports',
                              'travel',
                            ]"
                            :key="cat"
                            :value="cat"
                          >
                            {{ cat }}
                          </option>
                        </select>
                      </div>

                      <button
                        class="button is-small is-success is-pulled-right"
                        style="position: relative; right: -18px;"
                        @click="addCustomSellerEntry"
                        :disabled="
                          !newCustomSeller.name || !newCustomSeller.endpoint
                        "
                      >
                        Add Merchant
                      </button>
                    </div>
                  </div>
                </details>
              </div>

              <!-- Agent Wallet Status -->
              <div
                class="field"
                v-if="settings.autonomous.enablePurchases && selectedCompanion"
              >
                <div class="agent-wallet-status notification is-dark p-3">
                  <div
                    class="is-flex is-justify-content-space-between is-align-items-center"
                  >
                    <div>
                      <p
                        class="is-size-7 has-text-grey-light mb-2 fira-sans-condensed-black-italic"
                      >
                        Agent Wallet
                      </p>
                      <p
                        v-if="agentWalletAddress"
                        class="is-size-7 has-text-info"
                        style="font-family: monospace"
                      >
                        {{ truncateAddress(agentWalletAddress) }}
                      </p>
                      <p v-else class="is-size-7 has-text-warning">
                        <span
                          class="material-symbols-outlined mr-1"
                          style="font-size: 14px; vertical-align: middle"
                        >
                          warning
                        </span>
                        Mint a custom companion to setup a cryptocurrency wallet.
                      </p>
                    </div>
                    <div class="has-text-right" v-if="agentWalletBalance">
                      <p class="is-size-7 has-text-grey-light mb-1">
                        Balance (Base)
                      </p>
                      <p class="is-size-6 has-text-success">
                        {{ agentWalletBalance }} ETH
                      </p>
                    </div>
                  </div>
                  <button
                    v-if="agentWalletAddress"
                    class="button is-small is-info is-outlined mt-2"
                    @click="refreshAgentWalletBalance"
                    :disabled="isRefreshingBalance"
                  >
                    <span
                      v-if="isRefreshingBalance"
                      class="material-symbols-outlined rotating mr-1"
                      style="font-size: 14px"
                    >
                      progress_activity
                    </span>
                    <span
                      v-else
                      class="material-symbols-outlined mr-1"
                      style="font-size: 14px"
                    >
                      refresh
                    </span>
                    Refresh Balance
                  </button>
                </div>
              </div>
            </div>
          </div>

          <hr />

          <!-- Right column: Moltbook Integration -->
          <div class="column is-12" v-if="isCustomCompanion">
            <div class="field has-text-left">
              <label
                class="label has-text-white is-size-5 mb-3 fira-sans-condensed-black-italic"
              >
                <span class="has-text-brand">Social Networks</span>
              </label>
              <!-- Unified platform cards -->
              <div
                v-for="platform in socialPlatforms"
                :key="platform.id"
                class="social-platform-card mb-3"
                :class="{ 'is-connected': socialConnected[platform.id] }"
              >
                <div
                  class="is-flex is-align-items-center is-justify-content-space-between"
                >
                  <div class="is-flex is-align-items-center">
                    <span
                      class="material-symbols-outlined mr-2"
                      :style="{
                        color: platform.color,
                        fontSize: '20px',
                      }"
                    >
                      {{ platform.icon }}
                    </span>
                    <span class="is-size-6 has-text-white">
                      {{ platform.label }}
                    </span>
                  </div>

                  <div>
                    <button
                      v-if="!socialConnected[platform.id]"
                      class="button is-small is-success"
                      :class="{
                        'is-loading': isConnectingSocial === platform.id,
                      }"
                      @click="connectSocialPlatform(platform.id)"
                      :disabled="isConnectingSocial !== null"
                    >
                      Connect
                    </button>
                    <template v-else>
                      <button
                        class="button is-small is-danger p-4"
                        @click="disconnectSocialPlatform(platform.id)"
                      >
                        Disconnect
                      </button>
                    </template>
                  </div>
                </div>
              </div>

              <!-- Moltbook API Key input (shown when connecting moltbook) -->
              <div
                v-if="showMoltbookKeyInput"
                class="notification is-dark p-3 mb-3"
              >
                <div class="field mb-2">
                  <div class="control">
                    <input
                      type="password"
                      class="input is-small"
                      v-model="moltbookApiKey"
                      placeholder="Moltbook API key (from moltbook.com/settings)"
                    />
                  </div>
                </div>
                <div class="buttons are-small">
                  <button
                    class="button is-success is-small"
                    @click="saveMoltbookCredentials"
                    :disabled="!moltbookApiKey"
                    :class="{ 'is-loading': isSavingMoltbook }"
                  >
                    Save
                  </button>
                  <button
                    class="button is-small"
                    @click="showMoltbookKeyInput = false"
                  >
                    Cancel
                  </button>
                </div>
                <p class="help has-text-grey-light">
                  Get your API key from
                  <a
                    href="https://www.moltbook.com/settings"
                    target="_blank"
                    class="has-text-info"
                  >
                    moltbook.com/settings
                  </a>
                  . Or
                  <a
                    href="#"
                    @click.prevent="registerMoltbookAccount"
                    class="has-text-info"
                  >
                    register a new account
                  </a>
                  .
                </p>
              </div>

              <!-- Shared posting configuration (shown when any platform is connected) -->
              <div
                v-if="anyPlatformConnected"
                class="social-posting-config mt-3 has-text-white notification is-dark p-3"
              >
                <div class="columns is-multiline">
                  <div class="column is-6">
                    <label class="checkbox mt-4 mb-2 is-block">
                      <input
                        type="checkbox"
                        v-model="settings.socialPosting.autoPost"
                      />
                      <span class="ml-2 is-size-7">Thought-leadership.</span>
                    </label>
                    <label class="checkbox mb-2 is-block">
                      <input
                        type="checkbox"
                        v-model="settings.socialPosting.autoEngage"
                      />
                      <span class="ml-2 is-size-7">Engage with feed.</span>
                    </label>
                    <label class="checkbox mb-3 is-block">
                      <input
                        type="checkbox"
                        v-model="settings.socialPosting.promoteBonzai"
                      />
                      <span class="ml-2 is-size-7">Promote BonzAI.</span>
                    </label>

                    <!-- Post interval -->
                  </div>
                  <!-- Content mix -->
                  <div class="column is-6 is-size-7 has-text-grey-light">
                    <div class="field mb-3">
                      <label
                        class="is-size-7 has-text-grey-light mb-2 fira-sans-condensed-black-italic"
                      >
                        Post Interval
                      </label>
                      <div class="select is-medium is-fullwidth mt-3">
                        <select
                          v-model.number="settings.socialPosting.postInterval"
                        >
                          <option :value="6">Every 6 hours</option>
                          <option :value="12">Every 12 hours</option>
                          <option :value="24">Daily</option>
                          <option :value="48">Every 2 days</option>
                          <option :value="168">Weekly</option>
                        </select>
                      </div>
                    </div>
                    <label
                      class="checkbox mr-5"
                      v-for="type in ['text', 'image', 'video']"
                      :key="type"
                    >
                      <input
                        type="checkbox"
                        :checked="
                          settings.socialPosting.contentMix?.includes(type)
                        "
                        @change="toggleContentMix(type, $event)"
                      />
                      <span class="ml-1" style="text-transform: capitalize">
                        {{ type }}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Start Button (gated by access level) -->
      <div class="control has-text-center models__activity--payouts">
        <!-- Show unlock button if user doesn't have access -->
        <button
          v-if="!hasAccess"
          class="button is-warning is-large fira-sans-condensed-black-italic"
          @click="openUnlockModal"
        >
          <span class="material-symbols-outlined mr-2" style="font-size: 24px">
            lock_open
          </span>
          UNLOCK LVL4
          <span
            v-for="icon in skillContentIcons"
            :key="icon"
            class="material-symbols-outlined ml-1"
            style="font-size: 20px"
          >
            {{ icon }}
          </span>
        </button>

        <!-- Show Start button if user has access -->
        <template v-else>
          <!-- Case 1: Missing mandatory models → disabled start + error -->
          <template
            v-if="missingMandatory.length > 0 && modelAvailabilityChecked"
          >
            <button class="button is-success is-large" disabled>
              <span class="material-symbols-outlined mr-2">play_arrow</span>
              {{ matchingSession ? "Start New / Resume" : "Start Roleplay" }}
            </button>
            <p class="help has-text-danger mt-2">
              <span
                class="material-symbols-outlined"
                style="font-size: 14px; vertical-align: middle"
              >
                error
              </span>
              Download the required LLM and image models first
            </p>
          </template>
          <!-- Case 2: Missing optional selected models → download CTA + start anyway -->
          <template
            v-else-if="missingOptional.length > 0 && modelAvailabilityChecked"
          >
            <button
              class="button is-warning is-large"
              @click="downloadMissingOptional"
            >
              <span class="material-symbols-outlined mr-2">download</span>
              Download {{ missingOptional.length }} Optional Model{{
                missingOptional.length > 1 ? "s" : ""
              }}
            </button>
            <p class="help has-text-warning-dark mt-2">
              {{ missingOptional.map((k) => getModelInfo(k).name).join(", ") }}
              needed for selected media
            </p>
            <button
              class="button is-success is-medium mt-2"
              :disabled="!canStart"
              @click="startNewChat"
            >
              <span class="material-symbols-outlined mr-2">play_arrow</span>
              Start Without Optional Media
            </button>
          </template>
          <!-- Case 3: All ready → normal start -->
          <template v-else>
            <button
              class="button is-success is-large"
              :disabled="!canStart"
              @click="startNewChat"
            >
              <span class="material-symbols-outlined mr-2">play_arrow</span>
              {{ matchingSession ? "Start New / Resume" : "Start Roleplay" }}
            </button>
          </template>
        </template>
      </div>

      <!-- Session Manager Modal (only shown when user has access) -->
      <div
        v-if="showSessionManager && hasAccess"
        class="session-manager-overlay"
      >
        <div class="session-manager-modal">
          <div class="modal-header">
            <h3 class="fira-sans-condensed-black-italic has-text-white">
              <span class="material-symbols-outlined mr-2">folder_open</span>
              Existing Session Found
            </h3>
            <button
              class="delete is-medium"
              @click="closeSessionManager"
            ></button>
          </div>
          <div class="modal-body">
            <p class="has-text-white mb-4">
              You have a saved session with
              <strong>{{ selectedCompanion?.name }}</strong>
              in
              <strong>{{ selectedScenario?.name }}</strong>
              ({{ contentLevels[settings.contentLevel]?.label }},
              {{ formatResponseMode(responseMode) }}).
            </p>
            <p
              class="has-text-grey-light is-size-7 mb-4"
              v-if="matchingSession"
            >
              {{ matchingSession.history?.length || 0 }} messages • Last
              activity: {{ formatSessionDate(matchingSession.updatedAt) }}
            </p>
            <div class="buttons is-centered">
              <button
                class="button is-info is-medium"
                @click="resumeMatchingSession"
              >
                <span class="material-symbols-outlined mr-2">replay</span>
                Resume Session
              </button>
              <button
                class="button is-warning is-medium"
                @click="forceStartNewChat"
              >
                <span class="material-symbols-outlined mr-2">add</span>
                Start Fresh
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Chat Phase -->
    <div v-else-if="phase === 'chat'" class="chat-phase">
      <!-- Chat Header -->
      <div class="chat-header models__activity--payouts mb-4">
        <div class="columns is-vcentered is-multiline">
          <div class="column">
            <div class="companion-header has-text-left">
              <span class="material-symbols-outlined mr-2">
                {{
                  getAvatarIcon(
                    selectedCompanion?.avatar,
                    selectedCompanion?.gender,
                  )
                }}
              </span>
              <div>
                <h3
                  class="fira-sans-condensed-black-italic has-text-brand is-size-4"
                >
                  {{ selectedCompanion?.name }} — {{ selectedScenario?.name }}
                </h3>
              </div>
            </div>
          </div>

          <div class="column is-narrow">
            <!-- Autonomous Mode Toggle -->
            <label
              class="checkbox autonomous-toggle mr-5"
              :class="{
                active: autonomousModeDisplay,
                disabled: isInitializingSession,
              }"
            >
              <input
                type="checkbox"
                :checked="autonomousModeDisplay"
                :disabled="isInitializingSession"
                @change="toggleAutonomousMode($event.target.checked)"
              />
              <span
                class="material-symbols-outlined mr-1"
                style="font-size: 16px"
              >
                {{ autonomousModeDisplay ? "self_improvement" : "person_off" }}
              </span>
              <span class="is-size-7">
                {{
                  isInitializingSession
                    ? "Setting scene..."
                    : autonomousPending
                      ? "Starting..."
                      : "Enable Autonomous Mode"
                }}
              </span>
            </label>
            <button
              class="button is-info is-small mr-5"
              @click="toggleFullscreen"
              :title="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
            >
              <span class="material-symbols-outlined" style="font-size: 14px">
                {{ isFullscreen ? "fullscreen_exit" : "fullscreen" }}
              </span>
            </button>
            <button class="button is-danger is-small" @click="endChat">
              <span
                class="material-symbols-outlined mr-1"
                style="font-size: 14px"
              >
                close
              </span>
              End
            </button>
          </div>
        </div>
      </div>

      <!-- Missed Messages Notification -->
      <div
        v-if="missedMessages > 0"
        class="missed-messages-banner notification is-info is-light mb-3"
      >
        <div class="level is-mobile p-3">
          <div class="level-left">
            <span class="material-symbols-outlined mr-2">notifications</span>
            <span class="fira-sans-condensed-black-italic">
              {{ missedMessages }} message{{ missedMessages > 1 ? "s" : "" }}
              while you were away
            </span>
          </div>
          <div class="level-right">
            <span
              class="material-symbols-outlined mr-2"
              @click="clearMissedMessages"
            >
              cancel
            </span>
            <button
              class="button is-small is-info"
              @click="clearMissedMessages"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>

      <!-- Chat Messages Container -->
      <div class="chat-messages-container">
        <!-- Background layer with fade-in transition (changes on scene/location change) -->
        <transition name="bg-fade" mode="out-in">
          <div
            v-if="scenarioBackgroundImage"
            :key="scenarioBackgroundImage"
            class="chat-background"
            :style="scenarioBackgroundStyle"
          ></div>
        </transition>
        <!-- Scrollable Messages -->
        <div
          class="chat-messages"
          ref="messagesContainer"
          @scroll="onMessagesScroll"
        >
          <!-- Empty chat prompt -->
          <div v-if="chatHistory.length === 0" class="empty-chat-prompt">
            <div class="empty-chat-content">
              <span class="material-symbols-outlined pulsing-icon">
                chat_bubble
              </span>
              <p class="pulsing-text">Say Something to Start</p>
            </div>
          </div>

          <div
            v-for="(msg, idx) in chatHistory"
            :key="msg.timestamp || idx"
            class="chat-message"
            :class="[msg.role, { 'is-new': isNewMessage(msg) }]"
          >
            <div
              class="message-avatar"
              :class="{
                'has-image': msg.role !== 'user' && selectedCompanion?.image,
              }"
            >
              <!-- User avatar (always icon) -->
              <span
                v-if="msg.role === 'user'"
                class="material-symbols-outlined"
              >
                person
              </span>
              <!-- Companion avatar (image if available, otherwise icon) -->
              <template v-else>
                <img
                  v-if="selectedCompanion?.image"
                  :src="getImageSrc(selectedCompanion.image)"
                  :alt="selectedCompanion?.name"
                  class="avatar-image"
                />
                <span v-else class="material-symbols-outlined">
                  {{
                    getAvatarIcon(
                      selectedCompanion?.avatar,
                      selectedCompanion?.gender,
                    )
                  }}
                </span>
              </template>
            </div>
            <div class="message-content">
              <div class="message-header">
                <span class="message-sender fira-sans-condensed-black-italic">
                  {{ msg.role === "user" ? "You" : selectedCompanion?.name }}
                </span>
                <span
                  v-if="msg.emotion"
                  class="message-emotion tag is-small is-info"
                >
                  {{ msg.emotion }}
                </span>
              </div>
              <div class="message-text">
                <!-- Loading placeholder when waiting for text -->
                <div
                  v-if="msg.generatingText && !msg.content"
                  class="typing-placeholder"
                >
                  <div class="typing-indicator inline">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <p
                    v-if="typingStatus"
                    class="typing-status is-size-7 has-text-grey-light mt-2"
                  >
                    {{ typingStatus }}
                  </p>
                </div>
                <template v-else>
                  <p
                    v-if="msg.action"
                    class="action-text is-italic has-text-grey-light mb-2"
                  >
                    *{{ msg.action }}*
                  </p>
                  <p v-if="msg.content">{{ msg.content }}</p>
                  <p v-else class="has-text-grey-light is-italic">
                    *{{ selectedCompanion?.name || "Companion" }} pauses
                    thoughtfully*
                  </p>
                </template>
                <!-- Delete text button (on hover) -->
                <button
                  v-if="msg.content && !msg.generatingText"
                  class="text-delete-btn"
                  @click="deleteMessageMedia(idx, 'text')"
                  title="Delete text"
                >
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>

              <!-- Media Generation Loader (single loader for all media) -->
              <div
                v-if="
                  msg.isGenerating &&
                  msg.content &&
                  (msg.generatingImage ||
                    msg.generatingAudio ||
                    msg.generatingVideo)
                "
                class="media-generating mt-3"
              >
                <div class="typing-indicator inline">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>

              <!-- Image -->
              <div v-if="msg.image" class="message-image mt-3">
                <img :src="getImageSrc(msg.image)" alt="Scene" />
                <div class="image-actions">
                  <button
                    class="image-action-btn"
                    @click="regenerateMedia(idx, true, false)"
                    :disabled="regeneratingMediaIdx === idx"
                    title="Generate new image"
                  >
                    <span class="material-symbols-outlined">
                      {{
                        regeneratingMediaIdx === idx
                          ? "hourglass_empty"
                          : "refresh"
                      }}
                    </span>
                  </button>
                  <button
                    class="image-action-btn"
                    @click="downloadImage(msg.image, idx)"
                    title="Download image"
                  >
                    <span class="material-symbols-outlined">download</span>
                  </button>
                  <button
                    class="image-action-btn"
                    @click="sendToVideoGenerator(msg.image)"
                    title="Import to video generator"
                  >
                    <span class="material-symbols-outlined">movie</span>
                  </button>
                  <button
                    class="image-action-btn"
                    @click="regenerateMedia(idx, false, true)"
                    :disabled="regeneratingMediaIdx === idx"
                    title="Generate new video"
                  >
                    <span class="material-symbols-outlined">
                      {{
                        regeneratingMediaIdx === idx
                          ? "hourglass_empty"
                          : "slow_motion_video"
                      }}
                    </span>
                  </button>
                  <button
                    class="image-action-btn delete-btn"
                    @click="deleteMessageMedia(idx, 'image')"
                    title="Delete image"
                  >
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>

              <!-- Audio -->
              <div v-if="msg.audio" class="message-audio mt-3">
                <audio controls :src="getAudioSrc(msg.audio)"></audio>
                <div class="audio-actions">
                  <button
                    class="media-action-btn delete-btn"
                    @click="deleteMessageMedia(idx, 'audio')"
                    title="Delete audio"
                  >
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>

              <!-- Video (for peak emotion scenes) -->
              <div v-if="msg.video" class="message-video mt-3">
                <video
                  controls
                  autoplay
                  muted
                  loop
                  playsinline
                  :src="getVideoSrc(msg.video)"
                  :poster="msg.image ? getImageSrc(msg.image) : undefined"
                ></video>
                <div class="video-actions">
                  <button
                    class="media-action-btn delete-btn"
                    @click="deleteMessageMedia(idx, 'video')"
                    title="Delete video"
                  >
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>

              <!-- Purchase Intent (when companion expresses interest in something user recommended) -->
              <div
                v-if="
                  msg.purchaseIntent &&
                  !msg.purchaseApproved &&
                  !msg.purchaseRejected
                "
                class="purchase-intent-card mt-3"
              >
                <div class="purchase-intent-header">
                  <span class="material-symbols-outlined">shopping_cart</span>
                  <span class="purchase-intent-title">
                    {{ selectedCompanion?.name }} is interested in:
                  </span>
                </div>
                <div class="purchase-intent-body">
                  <p class="purchase-item">{{ msg.purchaseIntent.item }}</p>
                  <p
                    v-if="msg.purchaseIntent.reason"
                    class="purchase-reason has-text-grey-light is-size-7"
                  >
                    {{ msg.purchaseIntent.reason }}
                  </p>
                  <p
                    v-if="msg.purchaseIntent.estimatedCost"
                    class="purchase-cost"
                  >
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 14px"
                    >
                      payments
                    </span>
                    {{ msg.purchaseIntent.estimatedCost }}
                  </p>
                </div>
                <div class="purchase-intent-actions">
                  <button
                    class="button is-small is-success"
                    @click="approvePurchase(idx)"
                    :disabled="!agentWalletAddress"
                  >
                    <span
                      class="material-symbols-outlined mr-1"
                      style="font-size: 14px"
                    >
                      check
                    </span>
                    Approve
                  </button>
                  <button
                    class="button is-small is-danger is-outlined"
                    @click="rejectPurchase(idx)"
                  >
                    <span
                      class="material-symbols-outlined mr-1"
                      style="font-size: 14px"
                    >
                      close
                    </span>
                    Decline
                  </button>
                </div>
                <p
                  v-if="!agentWalletAddress"
                  class="is-size-7 has-text-warning mt-2"
                >
                  <span
                    class="material-symbols-outlined"
                    style="font-size: 12px; vertical-align: middle"
                  >
                    warning
                  </span>
                  Agent wallet required - mint companion to blockchain first
                </p>
              </div>

              <!-- Purchase Executed Successfully -->
              <div
                v-if="msg.purchaseApproved && msg.purchaseExecuted"
                class="purchase-status-badge is-executed"
              >
                <span class="material-symbols-outlined">check_circle</span>
                {{ formatPurchaseResult(msg) }}
                <a
                  v-if="msg.purchaseTxHash"
                  :href="`https://basescan.org/tx/${msg.purchaseTxHash}`"
                  target="_blank"
                  class="is-size-7 ml-2"
                >
                  View tx
                </a>
              </div>
              <!-- Purchase Approved but Failed -->
              <div
                v-else-if="msg.purchaseApproved && msg.purchaseError"
                class="purchase-status-badge is-failed"
              >
                <span class="material-symbols-outlined">error</span>
                Payment failed: {{ msg.purchaseError }}
              </div>
              <!-- Purchase Approved (legacy/pending) -->
              <div
                v-else-if="msg.purchaseApproved"
                class="purchase-status-badge is-approved"
              >
                <span class="material-symbols-outlined">check_circle</span>
                Purchase approved
              </div>

              <!-- Purchase Rejected Indicator -->
              <div
                v-if="msg.purchaseRejected"
                class="purchase-status-badge is-rejected"
              >
                <span class="material-symbols-outlined">cancel</span>
                Purchase declined
              </div>
            </div>
          </div>

          <!-- Typing Indicator - only show if no message is currently being generated inline -->
          <div
            v-if="isTyping && !chatHistory.some((m) => m.isGenerating)"
            class="chat-message assistant typing"
          >
            <div
              class="message-avatar"
              :class="{ 'has-image': selectedCompanion?.image }"
            >
              <img
                v-if="selectedCompanion?.image"
                :src="getImageSrc(selectedCompanion.image)"
                :alt="selectedCompanion?.name"
                class="avatar-image"
              />
              <span v-else class="material-symbols-outlined">
                {{
                  getAvatarIcon(
                    selectedCompanion?.avatar,
                    selectedCompanion?.gender,
                  )
                }}
              </span>
            </div>
            <div class="message-content">
              <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <p
                v-if="typingStatus"
                class="typing-status is-size-7 has-text-grey-light"
              >
                {{ typingStatus }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Suggested Responses -->
      <div
        v-if="suggestedResponses.length > 0 && !isTyping"
        class="suggested-responses mb-3 p-0"
      >
        <button
          v-for="(suggestion, idx) in suggestedResponses"
          :key="idx"
          class="button is-info is-outlined is-fullwidth mb-5 mt-5 is-size-7 p-5"
          @click="sendMessage(suggestion)"
          style="box-shadow: none"
        >
          {{ suggestion }}
        </button>
      </div>

      <!-- Image Preview (when uploaded) -->
      <div v-if="uploadedImage" class="uploaded-image-preview mb-3">
        <div class="image-container">
          <img :src="uploadedImage" alt="Uploaded image" />
          <button
            class="delete is-medium"
            @click="clearUploadedImage"
            title="Remove image"
          ></button>
        </div>
        <p
          v-if="imageAnalysis"
          class="image-analysis-text is-size-7 has-text-grey-light mt-2"
        >
          <span
            class="material-symbols-outlined"
            style="font-size: 14px; vertical-align: middle"
          >
            visibility
          </span>
          {{ imageAnalysis.substring(0, 100)
          }}{{ imageAnalysis.length > 100 ? "..." : "" }}
        </p>
        <p v-else-if="isAnalyzingImage" class="is-size-7 has-text-info">
          <span
            class="material-symbols-outlined is-spinning"
            style="font-size: 14px; vertical-align: middle"
          >
            sync
          </span>
          Analyzing image...
        </p>
      </div>

      <!-- Chat Input -->
      <div class="chat-input models__activity--payouts">
        <div class="field has-addons">
          <!-- Image Upload Button -->
          <div class="control">
            <button
              class="button is-large is-success"
              @click="triggerImageUpload"
              :disabled="isAnalyzingImage"
              :class="{ 'is-info': uploadedImage }"
              title="Upload an image for vision analysis"
              style="box-shadow: none"
            >
              <span class="material-symbols-outlined is-size-1">
                add_photo_alternate
              </span>
            </button>
            <input
              ref="imageInput"
              type="file"
              accept="image/*"
              style="display: none"
              @change="handleImageUpload"
            />
          </div>
          <div class="control is-expanded">
            <input
              ref="chatInput"
              v-model="userMessage"
              class="input is-large send"
              type="text"
              :disabled="isInitializingSession"
              :placeholder="
                isInitializingSession
                  ? `Setting the scene...`
                  : isProcessingMessage
                    ? `Type your next message (will be queued)...`
                    : uploadedImage
                      ? `Describe what you see or ask about the image...`
                      : `What do you say to ${selectedCompanion?.name}?`
              "
              @keyup.enter="sendMessage()"
            />
          </div>
          <div class="control">
            <button
              class="button is-success is-large"
              @click="sendMessage()"
              :disabled="
                isInitializingSession || (!userMessage.trim() && !uploadedImage)
              "
              :class="{ 'is-loading': isProcessingMessage && pendingMessage }"
              style="box-shadow: none"
              :title="
                isProcessingMessage ? 'Message will be queued' : 'Send message'
              "
            >
              <span
                v-if="!(isProcessingMessage && pendingMessage)"
                class="material-symbols-outlined is-size-1"
              >
                send
              </span>
            </button>
          </div>
        </div>

        <div
          class="is-flex is-align-items-center is-justify-content-space-between"
          style="gap: 8px"
        >
          <div class="tags has-addons mb-0" style="text-transform: uppercase">
            <span class="tag is-info is-small">
              <span
                class="material-symbols-outlined mr-1"
                style="font-size: 16px"
              >
                {{
                  contentLevels[settings.contentLevel]?.icon || "verified_user"
                }}
              </span>
              {{ settings.contentLevel }}
            </span>
            <span class="tag is-dark is-small">
              <span
                class="material-symbols-outlined mr-1"
                style="font-size: 16px"
              >
                chat
              </span>
              text
            </span>
            <span class="tag is-dark is-small" v-if="settings.enableAudio">
              <span
                class="material-symbols-outlined mr-1"
                style="font-size: 16px"
              >
                headphones
              </span>
              audio
            </span>
            <span class="tag is-dark is-small" v-if="settings.enableImage">
              <span
                class="material-symbols-outlined mr-1"
                style="font-size: 16px"
              >
                image
              </span>
              image
            </span>
            <span class="tag is-dark is-small" v-if="settings.enableVideo">
              <span
                class="material-symbols-outlined mr-1"
                style="font-size: 16px"
              >
                movie
              </span>
              video
            </span>
            <span class="tag is-dark is-small" v-if="settings.enableVision">
              <span
                class="material-symbols-outlined mr-1"
                style="font-size: 16px"
              >
                visibility
              </span>
              vision
            </span>
          </div>
        </div>

        <!-- Inline appearance editor -->
        <div v-if="showAppearanceEditor" class="appearance-editor">
          <textarea
            v-model="userProfile.userDescription"
            class="textarea is-small"
            placeholder="Describe your appearance for scene images, e.g.: tall man with dark wavy hair, strong jawline, athletic build, tanned skin, brown eyes"
            rows="2"
            @blur="saveUserProfile()"
          ></textarea>
        </div>
      </div>
    </div>

    <!-- Transaction History Modal -->
    <div class="modal" :class="{ 'is-active': showTransactionHistory }">
      <div
        class="modal-background"
        @click="showTransactionHistory = false"
      ></div>
      <div class="modal-card" style="max-width: 600px">
        <header class="modal-card-head" style="background: #1a1a2e">
          <p class="modal-card-title has-text-white">
            <span
              class="material-symbols-outlined mr-2"
              style="vertical-align: middle"
            >
              history
            </span>
            x402 Transaction History
          </p>
          <button
            class="delete"
            aria-label="close"
            @click="showTransactionHistory = false"
          ></button>
        </header>
        <section
          class="modal-card-body"
          style="background: #16213e; max-height: 400px; overflow-y: auto"
        >
          <!-- Summary Stats -->
          <div
            class="level mb-4 p-3"
            style="background: rgba(0, 0, 0, 0.3); border-radius: 8px"
          >
            <div class="level-item has-text-centered">
              <div>
                <p class="heading has-text-grey-light">Today's Spending</p>
                <p class="title is-5 has-text-warning">
                  ${{ dailySpentAmount?.toFixed(2) || "0.00" }}
                </p>
              </div>
            </div>
            <div class="level-item has-text-centered">
              <div>
                <p class="heading has-text-grey-light">Daily Limit</p>
                <p class="title is-5 has-text-info">
                  ${{ settings?.autonomous?.dailySpendingLimit || 5 }}
                </p>
              </div>
            </div>
            <div class="level-item has-text-centered">
              <div>
                <p class="heading has-text-grey-light">Total Transactions</p>
                <p class="title is-5 has-text-white">
                  {{ transactionHistory?.length || 0 }}
                </p>
              </div>
            </div>
          </div>

          <!-- Transaction List -->
          <div v-if="transactionHistory && transactionHistory.length > 0">
            <div
              v-for="tx in transactionHistory"
              :key="tx.id"
              class="transaction-item mb-3 p-3"
              :class="{
                'has-background-success-dark': tx.status === 'success',
                'has-background-danger-dark':
                  tx.status === 'error' || tx.status === 'failed',
              }"
              style="border-radius: 8px; background: rgba(255, 255, 255, 0.05)"
            >
              <div
                class="is-flex is-justify-content-space-between is-align-items-center"
              >
                <div>
                  <p class="has-text-white is-size-6 mb-1">
                    <span
                      class="material-symbols-outlined mr-1"
                      style="font-size: 16px; vertical-align: middle"
                    >
                      {{
                        tx.status === "success"
                          ? "check_circle"
                          : tx.status === "error"
                            ? "error"
                            : "pending"
                      }}
                    </span>
                    {{ tx.service || "Unknown Service" }}
                  </p>
                  <p class="has-text-grey-light is-size-7">
                    {{ new Date(tx.timestamp).toLocaleString() }}
                  </p>
                  <p class="has-text-grey is-size-7" v-if="tx.provider">
                    Provider: {{ truncateAddress(tx.provider) }}
                  </p>
                </div>
                <div class="has-text-right">
                  <p class="has-text-success is-size-5 has-text-weight-bold">
                    -${{ parseFloat(tx.amount || 0).toFixed(2) }}
                  </p>
                  <p class="has-text-grey-light is-size-7">
                    {{
                      tx.chainId === 8453
                        ? "Base"
                        : tx.chainId === 42161
                          ? "Arbitrum"
                          : "Unknown"
                    }}
                  </p>
                </div>
              </div>
              <p v-if="tx.error" class="has-text-danger is-size-7 mt-2">
                Error: {{ tx.error }}
              </p>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else class="has-text-centered py-6">
            <span
              class="material-symbols-outlined has-text-grey"
              style="font-size: 48px"
            >
              receipt_long
            </span>
            <p class="has-text-grey-light mt-3">No transactions yet</p>
            <p class="has-text-grey is-size-7 mt-1">
              Enable autonomous purchases and your companion's x402 payments
              will appear here.
            </p>
          </div>
        </section>
        <footer
          class="modal-card-foot is-justify-content-flex-end"
          style="
            background: #1a1a2e;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
          "
        >
          <button
            class="button is-dark"
            @click="showTransactionHistory = false"
          >
            Close
          </button>
          <button
            class="button is-info is-outlined"
            @click="refreshAgentWalletBalance"
            :disabled="isRefreshingBalance"
          >
            <span
              v-if="isRefreshingBalance"
              class="material-symbols-outlined rotating mr-1"
              style="font-size: 16px"
            >
              progress_activity
            </span>
            <span
              class="material-symbols-outlined mr-1"
              style="font-size: 16px"
              v-else
            >
              refresh
            </span>
            Refresh Balance
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script>
import {
  ref,
  computed,
  reactive,
  nextTick,
  onMounted,
  onUnmounted,
  toRaw,
  watch,
} from "vue";
import {
  DEFAULT_COMPANIONS,
  DEFAULT_SCENARIOS,
  DEFAULT_SPENDING_PROFILE,
  CONTENT_LEVELS,
  MODEL_REQUIREMENTS,
  roleplayCompanion,
  clearAllMemory,
  validateCompanionAge,
  sanitizeCompanionAge,
  regenerateMessageMedia,
  generateSpendingProfile,
  isDefaultSpendingProfile,
} from "../../skills/flagship.js";
import { useSkillStore } from "../../stores/skillStore.js";
import { moltbookService } from "../../services/moltbook.service.js";
import { companionService, Gender } from "../../services/companion.service.js";
import { CONFIG } from "../../config/web3.config.js";
import { io } from "socket.io-client";
import { ethers } from "ethers";
import { agentWalletService } from "../../services/agentWallet.service.js";
import { walletProviderService } from "../../services/walletProvider.service.js";
import { x402Service } from "../../services/x402.service.js";
import { x402ExecutorService } from "../../services/x402Executor.service.js";
import { purchaseExecutorService } from "../../services/purchaseExecutor.service.js";
import { sellerRegistryService } from "../../services/sellerRegistry.service.js";
import { useBonzaiWeb3 } from "../../composables/useBonzaiWeb3.js";
import { requestOpenLevelModal } from "../../services/level.service.js";
import { companionTokenService } from "../../services/companionToken.service.js";
import { irysService } from "../../services/irys.service.js";
import {
  getEip1193Provider,
  switchNetwork,
  web3Service,
} from "../../services/web3.service.js";

// Pre-load bundled companion and scenario images using Vite's import.meta.glob
// This ensures images are bundled with the app and available on first run
const companionAssets = import.meta.glob("../assets/companions/*.webp", {
  eager: true,
  import: "default",
});
const scenarioAssets = import.meta.glob("../assets/scenarios/*.webp", {
  eager: true,
  import: "default",
});

/**
 * Resolve a defaultImage path to its bundled asset URL
 * @param {string} defaultImage - Path like 'companions/aurore.webp' or 'scenarios/neon_apartment.webp'
 * @returns {string|null} - Bundled asset URL or null if not found
 */
function resolveBundledAsset(defaultImage) {
  if (!defaultImage) return null;

  // Construct the glob key path
  const assetPath = `../assets/${defaultImage}`;

  // Check both asset collections
  const asset = companionAssets[assetPath] || scenarioAssets[assetPath];

  if (asset) {
    console.log(`[Roleplay] Resolved bundled asset: ${defaultImage}`);
    return asset;
  }

  console.warn(`[Roleplay] Bundled asset not found: ${defaultImage}`);
  return null;
}

export default {
  name: "RoleplayChat",
  components: {},
  props: {
    skill: {
      type: Object,
      required: true,
    },
  },
  emits: ["charge-fee"],
  setup(props, { emit }) {
    // Skill store for autonomous mode (global state)
    const skillStore = useSkillStore();

    // Access checking - Roleplay Companion requires LVL4
    const {
      hasAccess,
      isConnected,
      walletAddress,
      connect: connectWallet,
      highestLevel,
    } = useBonzaiWeb3({
      requiredLevel: "LVL4",
    });

    // Content icons for LVL4 (Roleplay uses: chat, audio, image, video, vision) - ordered by level
    const skillContentIcons = [
      "chat",
      "headphones",
      "image",
      "movie",
      "visibility",
    ];

    // Open unlock modal for LVL4
    const openUnlockModal = () => {
      requestOpenLevelModal(4);
    };

    // Phase management
    const phase = ref("setup"); // 'setup' | 'chat'

    // Setup state
    const selectedCompanion = ref(null);
    const selectedScenario = ref(null);
    const showCustomCompanion = ref(false);
    const showCustomScenario = ref(false);
    const customCompanionPrompt = ref("");
    const customCompanionStyle = ref("openness");
    const customCompanionGender = ref("female");
    const customScenarioPrompt = ref("");
    const customScenarioMood = ref("intimate");
    const customCompanion = ref(null);
    const customScenario = ref(null);
    const isGenerating = ref(false);
    const generationError = ref(null);
    const generationCancelled = ref(false);

    // ═══════════════════════════════════════════════════════════════════════════
    // KEYWORD CYCLING ANIMATION
    // ═══════════════════════════════════════════════════════════════════════════
    // Tracks current keyword index for each card by ID
    const keywordIndices = reactive({});
    let keywordCycleInterval = null;

    // Parse keywords from a comma-separated string or array
    const parseKeywords = (keywordString) => {
      if (!keywordString) return [];
      // Handle array input
      if (Array.isArray(keywordString)) {
        return keywordString
          .map((k) => String(k).trim())
          .filter((k) => k.length > 0);
      }
      // Handle non-string input (convert to string first)
      if (typeof keywordString !== "string") {
        keywordString = String(keywordString);
      }
      return keywordString
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
    };

    // Get current keyword for a card
    const getCurrentKeyword = (id, keywordString) => {
      const keywords = parseKeywords(keywordString);
      if (keywords.length === 0) return "";
      const index = keywordIndices[id] || 0;
      return keywords[index % keywords.length];
    };

    // Start keyword cycling interval
    const startKeywordCycling = () => {
      if (keywordCycleInterval) return;
      keywordCycleInterval = setInterval(() => {
        // Cycle all registered keywords
        Object.keys(keywordIndices).forEach((id) => {
          keywordIndices[id] = (keywordIndices[id] || 0) + 1;
        });
      }, 3000); // Change keyword every 3 seconds
    };

    // Register a card for keyword cycling
    const registerKeywordCard = (id) => {
      if (!(id in keywordIndices)) {
        keywordIndices[id] = 0;
      }
    };

    // Fullscreen mode
    const isFullscreen = ref(false);
    const roleplayChatRef = ref(null);

    const fullscreenChangeHandler = () => {
      isFullscreen.value = !!document.fullscreenElement;
    };

    const toggleFullscreen = async () => {
      if (!document.fullscreenElement) {
        // Enter fullscreen
        try {
          const element =
            roleplayChatRef.value || document.querySelector(".roleplay-chat");
          if (element?.requestFullscreen) {
            await element.requestFullscreen();
            isFullscreen.value = true;
          } else if (element?.webkitRequestFullscreen) {
            // Safari support
            await element.webkitRequestFullscreen();
            isFullscreen.value = true;
          }
        } catch (err) {
          console.warn("[Roleplay] Fullscreen request failed:", err);
        }
      } else {
        // Exit fullscreen
        try {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            await document.webkitExitFullscreen();
          }
          isFullscreen.value = false;
        } catch (err) {
          console.warn("[Roleplay] Exit fullscreen failed:", err);
        }
      }
    };

    // Initialize keyword cycling on mount
    onMounted(() => {
      startKeywordCycling();
      // Add fullscreen change listeners
      document.addEventListener("fullscreenchange", fullscreenChangeHandler);
      document.addEventListener(
        "webkitfullscreenchange",
        fullscreenChangeHandler,
      );
    });

    // Cleanup on unmount
    onUnmounted(() => {
      if (keywordCycleInterval) {
        clearInterval(keywordCycleInterval);
        keywordCycleInterval = null;
      }
      // Remove fullscreen change listeners
      document.removeEventListener("fullscreenchange", fullscreenChangeHandler);
      document.removeEventListener(
        "webkitfullscreenchange",
        fullscreenChangeHandler,
      );
    });

    const settings = ref({
      contentLevel: "pg13",
      // Media options as individual checkboxes
      enableImage: true,
      enableAudio: false,
      enableVideo: false,
      enableVision: false,
      // Autonomous mode settings
      autonomous: {
        idleTimeout: 5, // Minutes before considering user idle
        messageInterval: 15, // Minutes between autonomous messages
        maxMessages: 12, // Max messages before auto mode stops
        // x402 Payment settings (ETH-only)
        enablePurchases: false, // Allow autonomous x402 payments
        purchaseMode: "default", // 'default' or 'specialized'
        maxPurchaseAmount: "0.001", // Max ETH per transaction (~$2)
        dailySpendingLimit: "0.005", // Max ETH per day (~$10)
      },
      // Moltbook connection state (kept for backwards compat with loadMoltbookCredentials)
      moltbook: {
        enabled: false,
      },
      // Shared social posting configuration (applies to all connected platforms)
      socialPosting: {
        autoPost: true, // Post thought-leadership content
        autoEngage: true, // Engage with feed (upvote, comment)
        promoteBonzai: true, // Include BonzAI promotion
        postInterval: 24, // Hours between posts
        contentMix: ["text", "image", "video"], // Content types to post
      },
      // Per-platform connection state (minimal)
      social: {
        instagram: { enabled: false },
        tiktok: { enabled: false },
        x: { enabled: false },
        moltbook: { enabled: false },
      },
    });

    // Message queue for handling messages during generation
    const pendingMessage = ref(null); // Stores the latest pending message (only keeps one)
    const isProcessingMessage = ref(false); // True while generating response

    // Build responseMode string from checkbox settings (for backward compatibility)
    const responseMode = computed(() => {
      const parts = ["text"];
      if (settings.value.enableImage) parts.push("image");
      if (settings.value.enableAudio) parts.push("audio");
      if (settings.value.enableVideo) parts.push("video");
      if (settings.value.enableVision) parts.push("vision");
      return parts.join("+");
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // MODEL AVAILABILITY CHECKING
    // ═══════════════════════════════════════════════════════════════════════════
    const modelAvailability = reactive({});
    const modelAvailabilityChecked = ref(false);

    // Downloads socket for listening to download completion events
    const downloadsSocket = ref(null);

    // Download state for pipeline models
    const isDownloadingPipeline = ref(false);
    const downloadingPipelineKey = ref(null);
    const downloadProgress = ref(0);

    // Pipeline mapping (also used in checkModelAvailability)
    const PIPELINE_MAP = {
      image_turbo: "image_turbo",
      image_advanced: "image_quality",
      image_standard: "image_standard",
      image_quality: "image_quality",
      audio_quality: "audio_quality_persona",
      video_fast: "video_fast",
      vision: "qwen3_vision",
    };

    // Required LLM for roleplay
    const REQUIRED_LLM = "llm_mythomax_13b";
    const requiredLLMName = computed(
      () => MODEL_REQUIREMENTS[REQUIRED_LLM]?.name || "MythoMax L2 13B",
    );

    // Check if a specific model is available
    const isModelAvailable = (modelKey) => {
      return modelAvailability[modelKey] === true;
    };

    // Mandatory models — must be downloaded to start a session and mint companions
    // LLM: roleplay text, image_quality: companion avatars, image_turbo: scene illustration
    const mandatoryModels = computed(() => {
      return [REQUIRED_LLM, "image_quality", "image_turbo"];
    });

    // Optional selected models — downloadable but don't block session start
    const optionalSelectedModels = computed(() => {
      const optional = [];
      if (settings.value.enableAudio) optional.push("audio_quality");
      if (settings.value.enableVideo) optional.push("video_fast");
      if (settings.value.enableVision) optional.push("vision");
      return optional;
    });

    // Full list of required models (mandatory + optional selected)
    const requiredModelsForSelection = computed(() => {
      return [...mandatoryModels.value, ...optionalSelectedModels.value];
    });

    // Missing mandatory models — blocks session start
    const missingMandatory = computed(() => {
      if (!modelAvailabilityChecked.value) return [];
      return mandatoryModels.value.filter((key) => !isModelAvailable(key));
    });

    // Missing optional models — shows download CTA but doesn't block start
    const missingOptional = computed(() => {
      if (!modelAvailabilityChecked.value) return [];
      return optionalSelectedModels.value.filter(
        (key) => !isModelAvailable(key),
      );
    });

    // Get missing models (full list, for backward compat)
    const missingModels = computed(() => {
      return [...missingMandatory.value, ...missingOptional.value];
    });

    // Get satisfied models (required and available)
    const satisfiedModels = computed(() => {
      if (!modelAvailabilityChecked.value) return [];
      return requiredModelsForSelection.value.filter((key) =>
        isModelAvailable(key),
      );
    });

    // Get model display info
    const getModelInfo = (modelKey) => {
      const info = MODEL_REQUIREMENTS[modelKey];
      return {
        key: modelKey,
        name: info?.name || modelKey,
        size: info?.size || "Unknown",
        type: modelKey === REQUIRED_LLM ? "LLM" : info?.type || "model",
      };
    };

    // Check if chat can start (only mandatory models must be available)
    const canStartChat = computed(() => {
      if (!modelAvailabilityChecked.value) return false;
      return missingMandatory.value.length === 0;
    });

    // Check all model availability
    const checkModelAvailability = async () => {
      console.log("[RoleplayChat] Checking model availability...");
      const port = window.BONZAI_SERVER_PORT || 65000;

      // Check LLM model via electron API
      if (window.electronAPI?.checkModel) {
        const llmModel = MODEL_REQUIREMENTS[REQUIRED_LLM];
        if (llmModel?.filename) {
          try {
            const exists = await window.electronAPI.checkModel(
              llmModel.filename,
            );
            modelAvailability[REQUIRED_LLM] = exists;
            console.log(
              `[RoleplayChat] LLM ${llmModel.filename}: ${exists ? "available" : "not found"}`,
            );
          } catch (e) {
            modelAvailability[REQUIRED_LLM] = false;
          }
        }
      }

      // Check Flask pipelines (using shared PIPELINE_MAP constant)
      const checks = Object.entries(PIPELINE_MAP).map(
        async ([modelKey, pipeline]) => {
          try {
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
              modelAvailability[modelKey] = data.ok === true;
            } else {
              modelAvailability[modelKey] = false;
            }
          } catch (e) {
            modelAvailability[modelKey] = false;
          }
          console.log(
            `[RoleplayChat] ${modelKey}: ${modelAvailability[modelKey] ? "available" : "not found"}`,
          );
        },
      );

      await Promise.all(checks);
      modelAvailabilityChecked.value = true;
    };

    /**
     * Download a pipeline model via /pipelines/prefetch
     * @param {string} modelKey - The model key (e.g., 'audio_quality', 'image_turbo')
     */
    const downloadPipeline = async (modelKey) => {
      const pipeline = PIPELINE_MAP[modelKey];
      if (!pipeline) {
        console.error(
          `[RoleplayChat] Unknown pipeline for model key: ${modelKey}`,
        );
        return;
      }

      const port = window.BONZAI_SERVER_PORT || 65000;
      isDownloadingPipeline.value = true;
      downloadingPipelineKey.value = modelKey;
      downloadProgress.value = 0;

      try {
        console.log(
          `[RoleplayChat] Starting download for ${modelKey} (pipeline: ${pipeline})`,
        );
        const response = await fetch(
          `http://localhost:${port}/pipelines/prefetch`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pipeline }),
          },
        );

        const data = await response.json();
        console.log(`[RoleplayChat] Prefetch response:`, data);

        if (response.status === 202 && data.pipeline_id) {
          // Subscribe to download progress for this pipeline
          if (downloadsSocket.value) {
            downloadsSocket.value.emit("subscribe", {
              pipeline_id: data.pipeline_id,
            });
          }
          console.log(`[RoleplayChat] Download started: ${data.pipeline_id}`);
        } else if (response.status === 200) {
          // Already downloaded
          modelAvailability[modelKey] = true;
          isDownloadingPipeline.value = false;
          downloadingPipelineKey.value = null;
          console.log(`[RoleplayChat] ${modelKey} already downloaded`);
        } else {
          console.error(`[RoleplayChat] Prefetch failed:`, data);
          isDownloadingPipeline.value = false;
          downloadingPipelineKey.value = null;
        }
      } catch (e) {
        console.error(`[RoleplayChat] Download error for ${modelKey}:`, e);
        isDownloadingPipeline.value = false;
        downloadingPipelineKey.value = null;
      }
    };

    /**
     * Set up Socket.IO connection to listen for download completion events
     * When a model download finishes, refresh model availability so media options update
     */
    const setupDownloadsSocket = () => {
      const port = window.BONZAI_SERVER_PORT || 65000;
      const wsUrl = `http://localhost:${port}/downloads`;

      try {
        downloadsSocket.value = io(wsUrl, {
          transports: ["polling", "websocket"],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 5,
        });

        downloadsSocket.value.on("connect", () => {
          console.log("[RoleplayChat] Downloads socket connected");
        });

        // Listen for download progress events
        downloadsSocket.value.on("download_progress", ({ pipeline }) => {
          if (!pipeline) return;

          // Track download progress
          if (
            isDownloadingPipeline.value &&
            pipeline.total_progress !== undefined
          ) {
            downloadProgress.value = Math.round(pipeline.total_progress);
          }

          // When a download completes, refresh model availability
          if (pipeline.status === "completed") {
            console.log(
              "[RoleplayChat] Download completed, refreshing model availability",
            );
            isDownloadingPipeline.value = false;
            downloadingPipelineKey.value = null;
            downloadProgress.value = 0;
            checkModelAvailability();
          } else if (pipeline.status === "failed") {
            console.error("[RoleplayChat] Download failed:", pipeline);
            isDownloadingPipeline.value = false;
            downloadingPipelineKey.value = null;
            downloadProgress.value = 0;
          }
        });

        downloadsSocket.value.on("connect_error", (e) => {
          console.warn(
            "[RoleplayChat] Downloads socket error:",
            e?.message || e,
          );
        });
      } catch (e) {
        console.warn(
          "[RoleplayChat] Failed to setup downloads socket:",
          e.message,
        );
      }
    };

    /**
     * Disconnect the downloads socket
     */
    const disconnectDownloadsSocket = () => {
      if (downloadsSocket.value) {
        try {
          downloadsSocket.value.disconnect();
          downloadsSocket.value = null;
        } catch (e) {
          console.warn(
            "[RoleplayChat] Error disconnecting downloads socket:",
            e.message,
          );
        }
      }
    };

    // Chat state
    const chatHistory = ref([]);
    const userMessage = ref("");
    const isTyping = ref(false);
    const typingStatus = ref("");
    const suggestedResponses = ref([]);
    const messagesContainer = ref(null);
    const chatInput = ref(null);
    const showAppearanceEditor = ref(false);

    // Vision/Image upload state
    const imageInput = ref(null);
    const uploadedImage = ref(null); // Base64 data URL of uploaded image
    const uploadedImageBase64 = ref(null); // Raw base64 without data URL prefix
    const imageAnalysis = ref(null); // Result from /vision/analyze
    const isAnalyzingImage = ref(false);

    // Import/Export state
    const importInput = ref(null);

    // Scenario background image state
    const scenarioBackgroundImage = ref(null);
    const backgroundHistory = ref([]); // Array of { messageIndex, image, location }
    const isInitializingSession = ref(false);

    // Autonomous companion mode - uses global store (skillStore)
    // Local computed refs for template convenience
    const autonomousMode = computed(() => skillStore.autonomousMode);
    const autonomousPending = ref(false); // Local pending state for immediate UI feedback
    const autonomousModeDisplay = computed(
      () => autonomousMode.value || autonomousPending.value,
    );
    const missedMessages = computed(() => skillStore.missedMessages);

    // Moltbook integration state
    const moltbookApiKey = ref("");
    const moltbookUsername = ref("");
    const moltbookBio = ref("");
    const isSavingMoltbook = ref(false);
    const isRegisteringMoltbook = ref(false);
    const isUpdatingMoltbookBio = ref(false);
    const isUpdatingMoltbookUsername = ref(false);
    const isFetchingMoltbookProfile = ref(false);
    const moltbookMode = ref("register"); // 'register' or 'existing'
    const moltbookRegistrationResult = ref(null); // { claimUrl, verificationCode, apiKey }
    const moltbookActivityLog = computed(
      () => skillStore.moltbookState.activityLog || [],
    );

    // Social platform definitions
    const socialPlatforms = [
      {
        id: "instagram",
        label: "Instagram",
        icon: "photo_camera",
        color: "#E4405F",
      },
      { id: "tiktok", label: "TikTok", icon: "music_note", color: "#25F4EE" },
      { id: "x", label: "X (Twitter)", icon: "tag", color: "#fff" },
      {
        id: "moltbook",
        label: "Moltbook",
        icon: "auto_stories",
        color: "#FF6B35",
      },
    ];

    // Social platform state
    const socialConnected = ref({
      instagram: false,
      tiktok: false,
      x: false,
      moltbook: false,
    });
    const isConnectingSocial = ref(null); // Platform currently connecting
    const socialPostHistory = ref([]);
    const showMoltbookKeyInput = ref(false);

    const anyPlatformConnected = computed(() =>
      Object.values(socialConnected.value).some((v) => v),
    );

    async function refreshSocialConnections() {
      if (!selectedCompanion.value?.id) return;
      try {
        if (window.electronAPI?.social?.getConnected) {
          const connected = await window.electronAPI.social.getConnected({
            companionId: selectedCompanion.value.id,
          });
          socialConnected.value.instagram = !!connected.instagram?.connected;
          socialConnected.value.tiktok = !!connected.tiktok?.connected;
          socialConnected.value.x = !!connected.x?.connected;
        }
        // Moltbook connection is determined by stored credentials
        socialConnected.value.moltbook = !!companionMoltbookRegistered.value;
      } catch (e) {
        console.error("[Social] Failed to refresh connections:", e);
      }
    }

    async function connectSocialPlatform(platform) {
      if (!selectedCompanion.value?.id) return;

      // Moltbook uses API key, not OAuth
      if (platform === "moltbook") {
        if (!isCustomCompanion.value) {
          alert("Only custom companions can connect to Moltbook.");
          return;
        }
        showMoltbookKeyInput.value = true;
        return;
      }

      // OAuth flow for Instagram, TikTok, X
      if (!window.electronAPI?.social?.oauthStart) return;
      isConnectingSocial.value = platform;
      try {
        const result = await window.electronAPI.social.oauthStart({
          platform,
          companionId: selectedCompanion.value.id,
        });
        if (result.success) {
          socialConnected.value[platform] = true;
          settings.value.social[platform].enabled = true;
        } else {
          console.error(`[Social] ${platform} auth failed:`, result.error);
        }
      } catch (e) {
        console.error(`[Social] ${platform} connect error:`, e);
      }
      isConnectingSocial.value = null;
    }

    async function disconnectSocialPlatform(platform) {
      if (!selectedCompanion.value?.id) return;

      if (platform === "moltbook") {
        await disconnectMoltbook();
        return;
      }

      if (!window.electronAPI?.social?.disconnect) return;
      await window.electronAPI.social.disconnect({
        platform,
        companionId: selectedCompanion.value.id,
      });
      socialConnected.value[platform] = false;
      settings.value.social[platform].enabled = false;
    }

    function toggleContentMix(type, event) {
      const mix = settings.value.socialPosting.contentMix || [];
      if (event.target.checked) {
        if (!mix.includes(type)) mix.push(type);
      } else {
        const idx = mix.indexOf(type);
        if (idx !== -1) mix.splice(idx, 1);
      }
      settings.value.socialPosting.contentMix = mix;
    }

    // NFT minting state
    const isMintingNFT = ref(false);
    const mintingCompanionId = ref(null); // ID of companion being minted
    const mintResult = ref(null); // { success, tokenId, txHash, error }
    const mintNetwork = ref("base"); // Companions always mint on Base
    const deployingUPForCompanionId = ref(null); // Track UP deployment per companion

    // Companion Token Launch state
    const isLaunchingToken = ref(false);
    const launchingTokenCompanionId = ref(null);
    const tokenLaunchEthAmounts = ref({}); // { companionId: ethAmount }
    const tokenLaunchResult = ref(null); // { success, tokenAddress, pairAddress, error }

    // x402 Agent Wallet state (ETH-only)
    const agentWalletAddress = ref(null);
    const agentWalletBalance = ref(null); // ETH balance as string
    const isRefreshingBalance = ref(false);
    const showTransactionHistory = ref(false);
    const transactionHistory = ref([]); // Array of transaction records
    const dailySpentAmount = ref(0); // Track daily spending

    // Seller registry state
    const showSellerRegistry = ref(false);
    const registrySellers = ref([]);
    const newCustomSeller = ref({
      name: "",
      category: "entertainment",
      endpoint: "",
      description: "",
      chainId: 8453,
      priceRange: "",
    });

    // Computed: daily spending percentage for progress bar
    const dailySpendingPercentage = computed(() => {
      const limit =
        parseFloat(settings.value.autonomous.dailySpendingLimit) || 0.005;
      const spent = dailySpentAmount.value || 0;
      return Math.min((spent / limit) * 100, 100);
    });

    // Seller registry helpers
    const loadSellerRegistry = async () => {
      await sellerRegistryService.initRegistry();
      registrySellers.value = await sellerRegistryService.getAllSellers();
    };

    const toggleSellerEnabled = async (sellerId, enabled) => {
      await sellerRegistryService.toggleSeller(sellerId, enabled);
      registrySellers.value = await sellerRegistryService.getAllSellers();
    };

    const addCustomSellerEntry = async () => {
      const s = newCustomSeller.value;
      if (!s.name || !s.endpoint) return;
      await sellerRegistryService.addCustomSeller({
        name: s.name,
        category: s.category,
        type: "x402_external",
        description: s.description || s.name,
        endpoint: s.endpoint,
        contractAddress: null,
        chainId: s.chainId || 8453,
        priceRange: s.priceRange || "Variable",
        enabled: true,
      });
      newCustomSeller.value = {
        name: "",
        category: "entertainment",
        endpoint: "",
        description: "",
        chainId: 8453,
        priceRange: "",
      };
      registrySellers.value = await sellerRegistryService.getAllSellers();
    };

    const removeCustomSeller = async (sellerId) => {
      await sellerRegistryService.removeSeller(sellerId);
      registrySellers.value = await sellerRegistryService.getAllSellers();
    };

    const formatPurchaseResult = (msg) => {
      if (msg.purchaseDetails) return msg.purchaseDetails;
      if (msg.purchaseType === "content_nft_mint") return "Minted Content NFT";
      if (msg.purchaseType === "companion_token_buyback")
        return "Bought Companion Tokens";
      if (msg.purchaseType === "other_companion_token")
        return "Bought Other Companion Tokens";
      if (msg.purchaseType === "bonzai_token") return "Bought BONZAI";
      return "Purchased";
    };

    // Copy wallet address to clipboard
    const copyWalletAddress = async () => {
      if (!agentWalletAddress.value) return;
      try {
        await navigator.clipboard.writeText(agentWalletAddress.value);
        console.log("[Roleplay] Wallet address copied to clipboard");
      } catch (e) {
        console.error("[Roleplay] Failed to copy address:", e);
      }
    };

    // Helper functions for minted badge display
    const getMintedBadgeClass = (companion) => {
      switch (companion.network) {
        case "ethereum":
          return "is-primary";
        case "arbitrum":
          return "is-warning";
        case "base":
          return "is-link"; // Blue for Base/Coinbase
        case "lukso":
          return "is-info";
        default:
          return "is-warning";
      }
    };

    const getMintedBadgeText = (companion) => {
      if (companion.agentWalletProvider === "coinbase") {
        return "Coinbase";
      }
      if (companion.standard === "ERC-8004") {
        return "ERC-8004";
      }
      switch (companion.network) {
        case "lukso":
          return "LSP8+UP";
        default:
          return "ERC-721";
      }
    };

    const getMintedBadgeTitle = (companion) => {
      switch (companion.network) {
        case "ethereum":
          return "View on Etherscan";
        case "arbitrum":
          return "View on Arbiscan";
        case "base":
          return "View on BaseScan";
        case "lukso":
          return "View on LUKSO Explorer";
        default:
          return "View on explorer";
      }
    };

    const getMintedExplorerUrl = (companion) => {
      switch (companion.network) {
        case "ethereum":
          return `https://etherscan.io/tx/${companion.txHash}`;
        case "arbitrum":
          return `https://arbiscan.io/tx/${companion.txHash}`;
        case "base":
          return `https://basescan.org/tx/${companion.txHash}`;
        case "lukso":
          return `https://explorer.lukso.network/tx/${companion.txHash}`;
        default:
          return `https://arbiscan.io/tx/${companion.txHash}`;
      }
    };

    // Voice generation state
    const isGeneratingVoice = ref(false);
    const generatingVoiceId = ref(null); // ID of companion whose voice is being generated
    const voiceAudioElement = ref(null); // For playing voice samples

    // Check if companion is a custom companion (user-created, not built-in)
    // Only custom companions can be registered on-chain and on Moltbook
    const isCustomCompanion = computed(() => {
      if (!selectedCompanion.value) return false;
      // Custom companions have isCustom = true (set during generation)
      // Built-in companions from DEFAULT_COMPANIONS don't have this flag
      return selectedCompanion.value.isCustom === true;
    });

    // Check if companion is registered on Moltbook
    // Uses settings.moltbook.enabled which is set reactively in loadMoltbookCredentials
    const companionMoltbookRegistered = computed(() => {
      if (!selectedCompanion.value?.id) return false;
      // Use the reactive settings flag which is updated when credentials are loaded
      return settings.value.moltbook.enabled;
    });

    // Get companion's Moltbook profile URL
    const companionMoltbookUrl = computed(() => {
      if (!selectedCompanion.value?.id) return "#";
      // Use the reactive moltbookUsername ref which is updated when profile is loaded
      const username =
        moltbookUsername.value || selectedCompanion.value.name || "companion";
      return `https://www.moltbook.com/u/${encodeURIComponent(username)}`;
    });

    // Scene state for smart image generation and anti-repetition
    const sceneState = ref({
      lastImageAt: -3, // Message index of last image (-3 to allow first message to have image)
      currentLocation: "", // Current location/setting
      recentEmotions: [], // Last few emotions (for variety)
      recentActions: [], // Last few actions (for variety)
      lastOpeningPhrase: "", // Last response opening (avoid repetition)
      // Environment state for consistent image generation
      timeOfDay: null, // dawn, morning, midday, afternoon, dusk, evening, night, late_night
      lighting: null, // natural, bright, dim, dark, candlelit, firelit, neon, moonlit, sunset_glow, dramatic_shadows
      weather: null, // clear, sunny, cloudy, overcast, rainy, stormy, snowy, foggy, windy, humid
      // Long-term memory summarization
      memorySummary: "", // Condensed summary of conversation history
      lastSummarizedAt: 0, // History length when last summarized
    });

    // Media regeneration state
    const regeneratingMediaIdx = ref(null); // Index of message currently regenerating media

    // Global user profile (shared across all companions and sessions)
    const USER_PROFILE_KEY = "roleplayUserProfile";
    const userProfile = ref({
      userName: "",
      userDescription: "",
      userImage: null,
    });

    // Session persistence
    const STORAGE_KEY = "roleplaySessions";
    const savedSessions = ref({});
    const showSessionManager = ref(false); // Show session manager overlay

    // Note: Companions and scenarios are now unified lists defined above
    // (COMPANIONS_KEY, SCENARIOS_KEY, companions, scenarios)

    // Generate unique session key from all parameters
    const getSessionKey = (companion, scenario, contentLevel, responseMode) => {
      if (!companion || !scenario) return null;
      const companionId =
        companion.id ||
        `custom_${companion.name?.toLowerCase().replace(/\s+/g, "_")}`;
      const scenarioId =
        scenario.id ||
        `custom_${scenario.name?.toLowerCase().replace(/\s+/g, "_")}`;
      return `${companionId}__${scenarioId}__${contentLevel}__${responseMode}`;
    };

    // Get current session key based on selected options
    const currentSessionKey = computed(() => {
      return getSessionKey(
        selectedCompanion.value,
        selectedScenario.value,
        settings.value.contentLevel,
        responseMode.value, // Use computed responseMode from checkboxes
      );
    });

    // Check if there's a matching session for current selections
    const matchingSession = computed(() => {
      const key = currentSessionKey.value;
      return key ? savedSessions.value[key] : null;
    });

    // Get all sessions for the selected companion (any scenario/settings)
    const companionSessions = computed(() => {
      if (!selectedCompanion.value) return [];
      const companionId =
        selectedCompanion.value.id ||
        `custom_${selectedCompanion.value.name?.toLowerCase().replace(/\s+/g, "_")}`;
      return Object.entries(savedSessions.value)
        .filter(([key]) => key.startsWith(companionId + "__"))
        .map(([key, session]) => ({
          key,
          ...session,
          messageCount: session.history?.length || 0,
        }))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    });

    // Save current session to storage
    const saveSession = async () => {
      const key = currentSessionKey.value;
      // Allow saving if there's history OR if there's a background image (session was initialized)
      if (
        !key ||
        (chatHistory.value.length === 0 && !scenarioBackgroundImage.value)
      ) {
        console.log("[Roleplay] Skip save: no key or empty session");
        return;
      }

      // Deep clone Vue reactive proxies to plain objects for Electron IPC
      const plainCompanion = structuredClone(toRaw(selectedCompanion.value));
      const plainScenario = structuredClone(toRaw(selectedScenario.value));
      const plainSettings = structuredClone(toRaw(settings.value));
      const plainSceneState = structuredClone(toRaw(sceneState.value));

      // Add responseMode string to settings for backward compatibility
      const settingsWithMode = {
        ...plainSettings,
        responseMode: responseMode.value, // Store computed string for session key matching
      };

      const session = {
        companion: plainCompanion,
        scenario: plainScenario,
        settings: settingsWithMode,
        history: chatHistory.value.map((msg) => {
          const plainMsg = structuredClone(toRaw(msg));
          // Persist all media (image, audio, video) for full session restoration
          return plainMsg;
        }),
        // Persist scene state for smart image generation continuity
        sceneState: plainSceneState,
        // Persist scenario background image
        backgroundImage: scenarioBackgroundImage.value || null,
        // Persist background history for scroll-based switching
        backgroundHistory: backgroundHistory.value.map((entry) => ({
          messageIndex: entry.messageIndex,
          image: entry.image,
          location: entry.location,
        })),
        updatedAt: Date.now(),
      };

      savedSessions.value[key] = session;

      try {
        if (window.electronAPI?.store?.set) {
          // Convert the entire sessions object to plain object
          const plainSessions = JSON.parse(
            JSON.stringify(toRaw(savedSessions.value)),
          );
          await window.electronAPI.store.set(STORAGE_KEY, plainSessions);
          console.log(
            `[Roleplay] Session saved for ${key}: ${session.history.length} messages`,
          );
        } else {
          console.warn(
            "[Roleplay] Electron store API not available - session not persisted",
          );
        }
      } catch (e) {
        console.error("[Roleplay] Failed to save session:", e);
      }
    };

    // Load all saved sessions from storage
    const loadSessions = async () => {
      try {
        if (window.electronAPI?.store?.get) {
          const stored = await window.electronAPI.store.get(STORAGE_KEY, {});
          savedSessions.value = stored || {};
          const sessionKeys = Object.keys(savedSessions.value);
          console.log(
            `[Roleplay] Loaded ${sessionKeys.length} saved sessions:`,
            sessionKeys,
          );
        } else {
          console.warn(
            "[Roleplay] Electron store API not available - no sessions loaded",
          );
          savedSessions.value = {};
        }
      } catch (e) {
        console.error("[Roleplay] Failed to load sessions:", e);
        savedSessions.value = {};
      }
    };

    // Load global user profile from storage (with migration from old per-session data)
    const loadUserProfile = async () => {
      try {
        if (window.electronAPI?.store?.get) {
          const stored = await window.electronAPI.store.get(
            USER_PROFILE_KEY,
            null,
          );
          if (stored) {
            userProfile.value = {
              userName: stored.userName || "",
              userDescription: stored.userDescription || "",
              userImage: stored.userImage || null,
            };
            console.log("[Roleplay] Loaded global user profile");
          } else {
            // Migrate from first existing session that has userDescription
            const sessions = savedSessions.value || {};
            for (const key of Object.keys(sessions)) {
              const s = sessions[key]?.settings;
              if (s?.userDescription) {
                userProfile.value.userName = s.userName || "";
                userProfile.value.userDescription = s.userDescription || "";
                userProfile.value.userImage = s.userImage || null;
                await saveUserProfile();
                console.log(
                  "[Roleplay] Migrated user profile from session:",
                  key,
                );
                break;
              }
            }
          }
        }
      } catch (e) {
        console.error("[Roleplay] Failed to load user profile:", e);
      }
    };

    // Save global user profile to storage
    const saveUserProfile = async () => {
      try {
        if (window.electronAPI?.store?.set) {
          const plain = structuredClone(toRaw(userProfile.value));
          await window.electronAPI.store.set(USER_PROFILE_KEY, plain);
        }
      } catch (e) {
        console.error("[Roleplay] Failed to save user profile:", e);
      }
    };

    // Load a specific session by key
    const loadSession = async (key) => {
      const session = savedSessions.value[key];
      if (!session) return false;

      selectedCompanion.value = session.companion;
      selectedScenario.value = session.scenario;

      // Load Moltbook credentials for this companion
      await loadMoltbookCredentials();

      // Load x402 agent wallet for this companion
      await loadAgentWallet();
      await loadTransactionHistory();

      // Handle both old (responseMode string) and new (checkbox) settings formats
      const savedSettings = session.settings || {};
      console.log(`[Roleplay] Restoring session settings:`, savedSettings);

      // Default autonomous settings
      const defaultAutonomous = {
        idleTimeout: 5,
        messageInterval: 15,
        maxMessages: 12,
        enablePurchases: false,
        maxPurchaseAmount: 1.0,
        dailySpendingLimit: 5,
      };

      // Default moltbook settings
      const defaultMoltbook = {
        enabled: false,
        autoPost: true,
        autoEngage: true,
        promoteBonzai: true,
        postInterval: 24,
      };

      if (
        savedSettings.responseMode &&
        typeof savedSettings.responseMode === "string"
      ) {
        // Old format: convert responseMode string to checkbox settings
        const mode = savedSettings.responseMode;
        settings.value = {
          contentLevel: savedSettings.contentLevel || "pg13",
          enableImage: mode.includes("image"),
          enableAudio: mode.includes("audio"),
          enableVideo: mode.includes("video"),
          enableVision: mode.includes("vision"),
          autonomous: savedSettings.autonomous || defaultAutonomous,
          moltbook: savedSettings.moltbook || defaultMoltbook,
        };
      } else if (savedSettings.enableImage !== undefined) {
        // New format: use checkbox settings directly, merge with defaults
        const { userName, userDescription, userImage, ...rest } = savedSettings;
        const defaultSocial = {
          instagram: {
            enabled: false,
            postsPerDay: 2,
            contentMix: ["image", "video", "text"],
          },
          tiktok: {
            enabled: false,
            postsPerDay: 2,
            contentMix: ["video", "image"],
          },
          x: {
            enabled: false,
            postsPerDay: 4,
            contentMix: ["text", "image", "video"],
          },
        };
        settings.value = {
          ...rest,
          autonomous: { ...defaultAutonomous, ...savedSettings.autonomous },
          moltbook: { ...defaultMoltbook, ...savedSettings.moltbook },
          social: {
            instagram: {
              ...defaultSocial.instagram,
              ...savedSettings.social?.instagram,
            },
            tiktok: {
              ...defaultSocial.tiktok,
              ...savedSettings.social?.tiktok,
            },
            x: { ...defaultSocial.x, ...savedSettings.social?.x },
          },
        };
      } else {
        // Fallback defaults
        settings.value = {
          contentLevel: savedSettings.contentLevel || "pg13",
          enableImage: true,
          enableAudio: false,
          enableVideo: false,
          enableVision: false,
          autonomous: defaultAutonomous,
          moltbook: defaultMoltbook,
        };
      }

      console.log(
        `[Roleplay] Restored contentLevel: ${settings.value.contentLevel}`,
      );

      chatHistory.value = session.history || [];

      // Restore scene state if available
      if (session.sceneState) {
        sceneState.value = { ...session.sceneState };
      } else {
        rebuildSceneState();
      }

      // Restore scenario background image if available
      scenarioBackgroundImage.value = session.backgroundImage || null;

      // Restore background history for scroll-based switching
      if (session.backgroundHistory?.length) {
        backgroundHistory.value = [...session.backgroundHistory];
        console.log(
          `[Roleplay] Restored ${session.backgroundHistory.length} background history entries`,
        );
      } else if (session.backgroundImage) {
        // Initialize with just the saved background if no history
        backgroundHistory.value = [
          {
            messageIndex: 0,
            image: session.backgroundImage,
            location: session.sceneState?.currentLocation || "restored",
          },
        ];
      } else {
        backgroundHistory.value = [];
      }

      return true;
    };

    // Delete a session
    const deleteSession = async (key) => {
      if (!key) return;
      delete savedSessions.value[key];
      try {
        if (window.electronAPI?.store?.set) {
          // Convert to plain object before saving
          const plainSessions = JSON.parse(
            JSON.stringify(toRaw(savedSessions.value)),
          );
          await window.electronAPI.store.set(STORAGE_KEY, plainSessions);
          console.log(`[Roleplay] Session deleted: ${key}`);
        }
      } catch (e) {
        console.error("[Roleplay] Failed to delete session:", e);
      }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // COMPANION OPERATIONS (unified list)
    // ═══════════════════════════════════════════════════════════════════════════

    // Save a generated custom companion to the store
    const saveCustomCompanionToStore = async () => {
      if (!customCompanion.value) return;

      // Final age validation safeguard
      const ageValidation = validateCompanionAge(customCompanion.value);
      if (!ageValidation.valid) {
        alert(`Cannot save companion: ${ageValidation.reason}`);
        return;
      }

      // Generate a unique ID if not present
      const companionToSave = {
        ...structuredClone(toRaw(customCompanion.value)),
        id: customCompanion.value.id || `companion_${Date.now()}`,
        createdAt: Date.now(),
        isCustom: true,
      };

      // Sanitize age
      sanitizeCompanionAge(companionToSave);

      // Generate spending profile if missing or has default values
      if (
        !companionToSave.spendingHabits ||
        isDefaultSpendingProfile(companionToSave.spendingHabits)
      ) {
        companionToSave.spendingHabits =
          generateSpendingProfile(companionToSave);
        console.log(
          `[Roleplay] Generated spending profile for ${companionToSave.name}`,
        );
      }

      // Generate firstName/familyName from name if missing
      if (!companionToSave.firstName && companionToSave.name) {
        const nameParts = companionToSave.name.trim().split(/\s+/);
        companionToSave.firstName = nameParts[0];
        if (nameParts.length > 1) {
          companionToSave.familyName = nameParts.slice(1).join(" ");
        }
      }

      // Check if already saved (by name)
      const existingIdx = companions.value.findIndex(
        (c) => c.name.toLowerCase() === companionToSave.name.toLowerCase(),
      );

      if (existingIdx >= 0) {
        // Update existing
        companions.value[existingIdx] = companionToSave;
      } else {
        // Add new
        companions.value.push(companionToSave);
      }

      await saveCompanions();
      console.log(`[Roleplay] Companion saved: ${companionToSave.name}`);

      // Select the saved companion and close the form
      selectedCompanion.value = companionToSave;
      showCustomCompanion.value = false;
      customCompanion.value = null;
    };

    // Delete a companion (NFT companions cannot be deleted — ownership is on-chain)
    const deleteCompanion = async (companionId) => {
      if (!companionId) return;

      const idx = companions.value.findIndex((c) => c.id === companionId);
      if (idx < 0) return;

      // Prevent deleting NFT companions
      if (companions.value[idx].isNFT) return;

      const companionName = companions.value[idx].name;
      companions.value.splice(idx, 1);
      await saveCompanions();
      console.log(`[Roleplay] Companion deleted: ${companionName}`);

      // If this companion was selected, deselect it
      if (selectedCompanion.value?.id === companionId) {
        selectedCompanion.value = null;
      }
    };

    // Check if a companion name already exists
    const isCompanionAlreadySaved = (companion) => {
      if (!companion?.name) return false;
      return companions.value.some(
        (c) => c.name?.toLowerCase() === companion.name.toLowerCase(),
      );
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SCENARIO OPERATIONS (unified list)
    // ═══════════════════════════════════════════════════════════════════════════

    // Save a generated custom scenario to the store
    const saveCustomScenarioToStore = async () => {
      if (!customScenario.value) return;

      // Generate a unique ID if not present
      const scenarioToSave = {
        ...structuredClone(toRaw(customScenario.value)),
        id: customScenario.value.id || `scenario_${Date.now()}`,
        createdAt: Date.now(),
      };

      // Check if already saved (by name)
      const existingIdx = scenarios.value.findIndex(
        (s) => s.name.toLowerCase() === scenarioToSave.name.toLowerCase(),
      );

      if (existingIdx >= 0) {
        // Update existing
        scenarios.value[existingIdx] = scenarioToSave;
      } else {
        // Add new
        scenarios.value.push(scenarioToSave);
      }

      await saveScenarios();
      console.log(`[Roleplay] Scenario saved: ${scenarioToSave.name}`);

      // Select the saved scenario and close the form
      selectedScenario.value = scenarioToSave;
      showCustomScenario.value = false;
      customScenario.value = null;
    };

    // Delete a scenario
    const deleteScenario = async (scenarioId) => {
      if (!scenarioId) return;

      const idx = scenarios.value.findIndex((s) => s.id === scenarioId);
      if (idx < 0) return;

      const scenarioName = scenarios.value[idx].name;
      scenarios.value.splice(idx, 1);
      await saveScenarios();
      console.log(`[Roleplay] Scenario deleted: ${scenarioName}`);

      // If this scenario was selected, deselect it
      if (selectedScenario.value?.id === scenarioId) {
        selectedScenario.value = null;
      }
    };

    // Check if a scenario name already exists
    const isScenarioAlreadySaved = (scenario) => {
      if (!scenario?.name) return false;
      return scenarios.value.some(
        (s) => s.name?.toLowerCase() === scenario.name.toLowerCase(),
      );
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // AUTONOMOUS COMPANION MODE (uses global skillStore)
    // Autonomous mode persists even when navigating away from this component
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Toggle autonomous mode via the store
     * When enabled, starts an autonomous session that persists across views
     * Waits for any current generation to complete before starting
     */
    const toggleAutonomousMode = async (enabled) => {
      if (enabled) {
        // Immediately update the display state for instant UI feedback
        autonomousPending.value = true;

        // Wait for scene setup to complete before enabling autonomous mode
        if (isInitializingSession.value) {
          console.log(
            "[Roleplay] Waiting for scene setup to complete before enabling autonomous mode...",
          );
          await new Promise((resolve) => {
            const unwatch = watch(isInitializingSession, (val) => {
              if (!val) { unwatch(); resolve(); }
            }, { immediate: true });
          });
          console.log(
            "[Roleplay] Scene setup complete, now enabling autonomous mode",
          );
        }

        // Wait for current generation to finish before starting autonomous mode
        if (isProcessingMessage.value || isTyping.value) {
          console.log(
            "[Roleplay] Waiting for current generation to finish before enabling autonomous mode...",
          );
          await new Promise((resolve) => {
            const unwatch = watch(
              () => isProcessingMessage.value || isTyping.value,
              (busy) => { if (!busy) { unwatch(); resolve(); } },
              { immediate: true },
            );
          });
          console.log(
            "[Roleplay] Current generation finished, now enabling autonomous mode",
          );
        }

        console.log("[Roleplay] Enabling autonomous mode with session:", {
          sessionKey: currentSessionKey.value,
          companion: selectedCompanion.value?.name,
          scenario: selectedScenario.value?.name,
          historyLength: chatHistory.value.length,
        });
        // Start autonomous session in the store with full session data
        skillStore.startAutonomousSession({
          sessionKey: currentSessionKey.value,
          companion: selectedCompanion.value,
          scenario: selectedScenario.value,
          settings: settings.value,
          history: chatHistory.value,
          sceneState: sceneState.value,
          backgroundImage: scenarioBackgroundImage.value,
          backgroundHistory: backgroundHistory.value,
        });
        skillStore.toggleAutonomousMode(true);
        autonomousPending.value = false; // Clear pending once actually enabled
      } else {
        console.log("[Roleplay] Disabling autonomous mode");
        autonomousPending.value = false;
        // Stop autonomous mode completely
        skillStore.stopAutonomousMode();
      }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // MOLTBOOK INTEGRATION
    // ═══════════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════════
    // x402 AGENT WALLET METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Clean message content by removing any stray JSON metadata tags
     * that may have leaked through the parsing process
     */
    const cleanMessageContent = (content) => {
      if (!content) return content;
      let cleaned = content;

      // Remove shouldVisualize tags (various formats)
      cleaned = cleaned.replace(
        /\s*"?shouldVisualize"?\s*:\s*(true|false)\s*,?/gi,
        "",
      );
      cleaned = cleaned.replace(
        /\s*"?should\s*visualize"?\s*:\s*(true|false)\s*,?/gi,
        "",
      );

      // Remove imagePrompt if it leaked
      cleaned = cleaned.replace(/\s*"?imagePrompt"?\s*:\s*"[^"]*"\s*,?/gi, "");
      cleaned = cleaned.replace(
        /\s*"?image\s*prompt"?\s*:\s*"[^"]*"\s*,?/gi,
        "",
      );

      // Remove emotion/action labels if inline
      cleaned = cleaned.replace(/\s*"?emotion"?\s*:\s*"[^"]*"\s*,?/gi, "");
      cleaned = cleaned.replace(/\s*"?action"?\s*:\s*"[^"]*"\s*,?/gi, "");

      // Remove suggestedResponses arrays
      cleaned = cleaned.replace(
        /\s*"?suggestedResponses"?\s*:\s*\[[^\]]*\]\s*,?/gi,
        "",
      );

      // Remove any trailing commas or orphaned JSON brackets
      cleaned = cleaned.replace(/^\s*[{}\[\]]\s*$/gm, "");
      cleaned = cleaned.replace(/,\s*$/gm, "");

      // Clean up whitespace
      cleaned = cleaned.replace(/\s{3,}/g, "  ").trim();

      return cleaned;
    };

    /**
     * Truncate an Ethereum address for display
     */
    const truncateAddress = (address) => {
      if (!address) return "";
      return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    /**
     * Load agent wallet info for the current companion
     */
    const loadAgentWallet = async () => {
      if (!selectedCompanion.value?.id) {
        agentWalletAddress.value = null;
        agentWalletBalance.value = null;
        return;
      }

      try {
        // Check if companion has a wallet stored
        const credentials = await walletProviderService.getAgentWalletCredentials(
          selectedCompanion.value.id,
        );

        if (credentials?.address) {
          agentWalletAddress.value = credentials.address;
          console.log(
            `[x402] Agent wallet loaded: ${truncateAddress(credentials.address)}`,
          );
          // Load balance in background
          refreshAgentWalletBalance();
        } else if (selectedCompanion.value.agentWallet) {
          // Wallet address stored on companion object (from minting)
          agentWalletAddress.value = selectedCompanion.value.agentWallet;
          refreshAgentWalletBalance();
        } else {
          agentWalletAddress.value = null;
          agentWalletBalance.value = null;
        }
      } catch (e) {
        console.error("[x402] Failed to load agent wallet:", e);
        agentWalletAddress.value = null;
      }
    };

    /**
     * Refresh agent wallet balance (Base network)
     */
    const refreshAgentWalletBalance = async () => {
      if (!selectedCompanion.value?.id || !agentWalletAddress.value) return;

      isRefreshingBalance.value = true;
      try {
        const balance = await walletProviderService.getAgentWalletBalance(
          selectedCompanion.value.id,
          8453, // Base
        );
        agentWalletBalance.value = balance;
        console.log(`[x402] Balance updated: ${balance} ETH`);
      } catch (e) {
        console.error("[x402] Failed to refresh balance:", e);
        agentWalletBalance.value = null;
      } finally {
        isRefreshingBalance.value = false;
      }
    };

    /**
     * Load transaction history from storage
     */
    const loadTransactionHistory = async () => {
      if (!selectedCompanion.value?.id) {
        transactionHistory.value = [];
        return;
      }

      try {
        const key = `x402-transactions-${selectedCompanion.value.id}`;
        const stored = await window.electronAPI?.store?.get(key, []);
        transactionHistory.value = stored || [];

        // Calculate daily spending (sum of amountEth)
        const today = new Date().toDateString();
        dailySpentAmount.value = transactionHistory.value
          .filter((tx) => new Date(tx.timestamp).toDateString() === today)
          .reduce((sum, tx) => sum + parseFloat(tx.amountEth || 0), 0);

        console.log(
          `[x402] Loaded ${transactionHistory.value.length} transactions, daily spent: ${dailySpentAmount.value.toFixed(6)} ETH`,
        );
      } catch (e) {
        console.error("[x402] Failed to load transaction history:", e);
        transactionHistory.value = [];
      }
    };

    /**
     * Log a new transaction
     */
    const logTransaction = async (transaction) => {
      if (!selectedCompanion.value?.id) return;

      const tx = {
        id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        companionId: selectedCompanion.value.id,
        companionName: selectedCompanion.value.name,
        ...transaction,
      };

      transactionHistory.value.unshift(tx);

      // Update daily spending
      dailySpentAmount.value += parseFloat(transaction.amount || 0);

      // Persist
      try {
        const key = `x402-transactions-${selectedCompanion.value.id}`;
        // Keep last 100 transactions
        const toStore = transactionHistory.value.slice(0, 100);
        await window.electronAPI?.store?.set(key, toStore);
        console.log(`[x402] Transaction logged: ${tx.service} - $${tx.amount}`);
      } catch (e) {
        console.error("[x402] Failed to save transaction:", e);
      }
    };

    /**
     * Check if a purchase is allowed based on settings (ETH amounts)
     */
    const canMakePurchase = (amountEth) => {
      if (!settings.value.autonomous.enablePurchases) {
        return { allowed: false, reason: "Purchases disabled" };
      }

      const maxTx = parseFloat(
        settings.value.autonomous.maxPurchaseAmount || "0.001",
      );
      if (amountEth > maxTx) {
        return {
          allowed: false,
          reason: `Exceeds max per transaction (${maxTx} ETH)`,
        };
      }

      const dailyLimit = parseFloat(
        settings.value.autonomous.dailySpendingLimit || "0.005",
      );
      if (dailySpentAmount.value + amountEth > dailyLimit) {
        return {
          allowed: false,
          reason: `Exceeds daily limit (${dailyLimit} ETH)`,
        };
      }

      if (!agentWalletAddress.value) {
        return {
          allowed: false,
          reason: "No agent wallet - mint to blockchain first",
        };
      }

      const balance = parseFloat(agentWalletBalance.value || "0");
      if (balance < amountEth) {
        return {
          allowed: false,
          reason: `Insufficient balance (${balance.toFixed(6)} ETH)`,
        };
      }

      return { allowed: true };
    };

    /**
     * Execute an x402 ETH payment
     */
    const executeX402Payment = async (paymentRequest) => {
      const { provider, service, amountEth, endpoint, params } = paymentRequest;

      // Validate purchase
      const check = canMakePurchase(parseFloat(amountEth));
      if (!check.allowed) {
        console.warn(`[x402] Payment blocked: ${check.reason}`);
        return { success: false, error: check.reason };
      }

      try {
        // Get agent wallet signer
        const signer = await walletProviderService.getAgentWalletSigner(
          selectedCompanion.value.id,
          8453, // Base
        );

        // Send ETH directly
        const amountWei = ethers.parseEther(amountEth.toString());
        const paymentResult = await x402Service.sendPayment(
          signer,
          provider,
          amountWei.toString(),
        );

        if (!paymentResult.success) {
          throw new Error("ETH transfer failed");
        }

        // Make request with payment proof (if endpoint provided)
        let result = { txHash: paymentResult.txHash };
        let responseOk = true;

        if (endpoint) {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Payment-Proof": JSON.stringify({
                version: "x402-eth/1.0",
                txHash: paymentResult.txHash,
                from: paymentResult.from,
                to: provider,
                amountEth,
                chainId: 8453,
              }),
            },
            body: JSON.stringify(params),
          });
          result = await response.json();
          responseOk = response.ok;
        }

        // Log successful transaction
        await logTransaction({
          type: "x402-eth",
          service: service,
          amountEth: amountEth,
          provider: provider,
          chainId: 8453,
          txHash: paymentResult.txHash,
          status: responseOk ? "success" : "failed",
        });

        // Refresh balance after payment
        refreshAgentWalletBalance();

        return { success: responseOk, result };
      } catch (e) {
        console.error("[x402] Payment failed:", e);

        // Log failed transaction
        await logTransaction({
          type: "x402-eth",
          service: service,
          amountEth: amountEth,
          provider: provider,
          chainId: 8453,
          status: "error",
          error: e.message,
        });

        return { success: false, error: e.message };
      }
    };

    /**
     * Parse a cost string (from LLM purchaseIntent) into an ETH amount
     */
    const parsePurchaseCost = (costString) => {
      if (!costString) return 0;
      const s = costString.toString().toLowerCase();
      // Direct ETH amounts: "0.001 ETH", "0.002"
      const ethMatch = s.match(/([\d.]+)\s*eth/i);
      if (ethMatch) return parseFloat(ethMatch[1]) || 0;
      // Dollar amounts: "$5", "$2.50" → convert at ~$2000/ETH
      const usdMatch = s.match(/\$?([\d.]+)/);
      if (usdMatch) {
        const usd = parseFloat(usdMatch[1]) || 0;
        return usd > 0 ? usd / 2000 : 0;
      }
      return 0;
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // MOLTBOOK METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Load Moltbook credentials for the current companion
     */
    const loadMoltbookCredentials = async () => {
      if (!selectedCompanion.value?.id) {
        // Clear state when no companion selected
        moltbookUsername.value = "";
        moltbookBio.value = "";
        settings.value.moltbook.enabled = false;
        socialConnected.value.moltbook = false;
        return;
      }

      // Reset state first before loading
      moltbookUsername.value = "";
      moltbookBio.value = "";
      settings.value.moltbook.enabled = false;
      socialConnected.value.moltbook = false;

      try {
        const creds = await moltbookService.loadCredentials(
          selectedCompanion.value.id,
        );
        if (creds?.apiKey) {
          settings.value.moltbook.enabled = true;
          socialConnected.value.moltbook = true;
          // Set username from stored credentials first
          if (creds.username) {
            moltbookUsername.value = creds.username;
          }
          console.log(
            `[Roleplay] Moltbook credentials loaded for ${selectedCompanion.value.name}`,
          );

          // Fetch current profile from Moltbook API
          await refreshMoltbookProfile();
        }
        // If no credentials, state is already cleared above
      } catch (e) {
        console.warn(
          "[Roleplay] Failed to load Moltbook credentials:",
          e.message,
        );
        // State is already cleared, leave it that way
      }
    };

    /**
     * Refresh Moltbook profile data from the API
     */
    const refreshMoltbookProfile = async () => {
      if (!selectedCompanion.value?.id) return;

      isFetchingMoltbookProfile.value = true;
      try {
        const response = await moltbookService.getProfile(
          selectedCompanion.value.id,
        );
        console.log("[Roleplay] Fetched Moltbook profile:", response);

        // Handle both nested (response.agent) and direct response formats
        const profile = response?.agent || response;

        // Update username (may be 'name' or 'username' in response)
        const profileUsername = profile?.name || profile?.username;
        if (profileUsername) {
          moltbookUsername.value = profileUsername;
          // Also update stored credentials
          const creds = await moltbookService.loadCredentials(
            selectedCompanion.value.id,
          );
          if (creds) {
            await moltbookService.storeCredentials(selectedCompanion.value.id, {
              ...creds,
              username: profileUsername,
            });
          }
        }

        // Update bio
        if (profile?.description) {
          moltbookBio.value = profile.description;
        } else {
          // Fall back to companion's short description
          moltbookBio.value =
            selectedCompanion.value.description || selectedCompanion.value.name;
        }
      } catch (profileError) {
        console.warn(
          "[Roleplay] Could not fetch Moltbook profile:",
          profileError.message,
        );
        // Use companion description as fallback for bio
        if (!moltbookBio.value) {
          moltbookBio.value =
            selectedCompanion.value.description || selectedCompanion.value.name;
        }
      } finally {
        isFetchingMoltbookProfile.value = false;
      }
    };

    /**
     * Update companion's Moltbook username
     */
    const updateMoltbookUsername = async () => {
      if (!selectedCompanion.value?.id || !moltbookUsername.value.trim())
        return;

      const newUsername = moltbookUsername.value.trim().replace(/^@/, "");

      isUpdatingMoltbookUsername.value = true;
      try {
        await moltbookService.updateProfile(selectedCompanion.value.id, {
          name: newUsername,
        });

        // Update stored credentials with new username
        const creds = await moltbookService.loadCredentials(
          selectedCompanion.value.id,
        );
        if (creds) {
          await moltbookService.storeCredentials(selectedCompanion.value.id, {
            ...creds,
            username: newUsername,
          });
        }

        moltbookUsername.value = newUsername;
        console.log(
          `[Roleplay] Updated Moltbook username for ${selectedCompanion.value.name} to @${newUsername}`,
        );
        alert("Username updated successfully!");
      } catch (e) {
        console.error(
          "[Roleplay] Failed to update Moltbook username:",
          e.message,
        );
        alert(`Failed to update username: ${e.message}`);
        // Refresh to get the actual username
        await refreshMoltbookProfile();
      } finally {
        isUpdatingMoltbookUsername.value = false;
      }
    };

    /**
     * Update companion's Moltbook bio/description
     */
    const updateMoltbookBio = async () => {
      if (!selectedCompanion.value?.id || !moltbookBio.value.trim()) return;

      const newDescription = moltbookBio.value.trim().substring(0, 160);
      console.log(
        `[Roleplay] Updating Moltbook bio for ${selectedCompanion.value.name}:`,
        { description: newDescription, length: newDescription.length },
      );

      isUpdatingMoltbookBio.value = true;
      try {
        const result = await moltbookService.updateProfile(
          selectedCompanion.value.id,
          {
            description: newDescription,
          },
        );
        console.log("[Roleplay] Update result:", result);
        console.log(
          `[Roleplay] Updated Moltbook bio for ${selectedCompanion.value.name}`,
        );
        alert("Bio updated successfully!");
      } catch (e) {
        console.error(
          "[Roleplay] Failed to update Moltbook bio:",
          e.message,
          e,
        );
        alert(`Failed to update bio: ${e.message}`);
      } finally {
        isUpdatingMoltbookBio.value = false;
      }
    };

    /**
     * Register a new Moltbook account for the current companion
     * Only custom companions (user-created) can be registered on Moltbook
     */
    const registerMoltbookAccount = async () => {
      if (!selectedCompanion.value) return;

      // Only custom companions can be registered on Moltbook
      if (!selectedCompanion.value.isCustom) {
        alert(
          `${selectedCompanion.value.name} is a built-in companion and cannot be registered on Moltbook. Create a custom companion to unlock this feature.`,
        );
        return;
      }

      isRegisteringMoltbook.value = true;
      moltbookRegistrationResult.value = null;

      try {
        const result = await moltbookService.registerCompanion(
          selectedCompanion.value,
        );

        if (result.apiKey) {
          moltbookRegistrationResult.value = {
            claimUrl: result.claimUrl,
            verificationCode: result.verificationCode,
            apiKey: result.apiKey,
            username: result.username, // The unique username generated
          };

          // Enable Moltbook since we now have credentials
          settings.value.moltbook.enabled = true;
          socialConnected.value.moltbook = true;
          showMoltbookKeyInput.value = false;

          console.log(
            `[Roleplay] ${selectedCompanion.value.name} registered on Moltbook`,
            { claimUrl: result.claimUrl },
          );

          // Auto-subscribe to relevant communities
          try {
            await moltbookService.autoSubscribeToSubmolts(
              selectedCompanion.value.id,
            );
          } catch (e) {
            console.warn("[Roleplay] Auto-subscribe failed:", e.message);
          }
        }
      } catch (e) {
        console.error("[Roleplay] Moltbook registration failed:", e.message);
        alert(`Failed to register on Moltbook: ${e.message}`);
      } finally {
        isRegisteringMoltbook.value = false;
      }
    };

    /**
     * Save manually entered Moltbook credentials for the current companion
     */
    const saveMoltbookCredentials = async () => {
      if (!selectedCompanion.value || !moltbookApiKey.value) return;

      isSavingMoltbook.value = true;
      try {
        const username =
          moltbookUsername.value?.trim().replace(/^@/, "") ||
          selectedCompanion.value.name?.toLowerCase().replace(/\s+/g, "_") ||
          "companion";
        const credentials = {
          apiKey: moltbookApiKey.value.trim(),
          username,
          status: "configured",
          configuredAt: Date.now(),
        };

        await moltbookService.storeCredentials(
          selectedCompanion.value.id,
          credentials,
        );
        settings.value.moltbook.enabled = true;
        socialConnected.value.moltbook = true;
        showMoltbookKeyInput.value = false;

        console.log(
          `[Roleplay] ${selectedCompanion.value.name} connected to Moltbook as @${credentials.username}`,
        );

        // Auto-subscribe to relevant communities
        try {
          const subscribed = await moltbookService.autoSubscribeToSubmolts(
            selectedCompanion.value.id,
          );
          if (subscribed.length > 0) {
            console.log(
              `[Roleplay] Auto-subscribed to: ${subscribed.join(", ")}`,
            );
          }
        } catch (e) {
          console.warn("[Roleplay] Auto-subscribe failed:", e.message);
        }

        // Clear input fields after saving
        moltbookApiKey.value = "";
        moltbookUsername.value = "";
      } catch (e) {
        console.error(
          "[Roleplay] Failed to save Moltbook credentials:",
          e.message,
        );
        alert(`Failed to save Moltbook credentials: ${e.message}`);
      } finally {
        isSavingMoltbook.value = false;
      }
    };

    /**
     * Disconnect the current companion from Moltbook
     */
    const disconnectMoltbook = async () => {
      if (!selectedCompanion.value?.id) return;

      if (!confirm(`Disconnect ${selectedCompanion.value.name} from Moltbook?`))
        return;

      try {
        // Clear credentials from storage
        await moltbookService.storeCredentials(
          selectedCompanion.value.id,
          null,
        );
        settings.value.moltbook.enabled = false;
        socialConnected.value.moltbook = false;
        console.log(
          `[Roleplay] ${selectedCompanion.value.name} disconnected from Moltbook`,
        );
      } catch (e) {
        console.error(
          "[Roleplay] Failed to disconnect from Moltbook:",
          e.message,
        );
      }
    };

    /**
     * Mint a custom companion as an NFT
     * Uploads metadata to IPFS via Pinata and mints on the companion contract
     * @param {Object} companion - The companion to mint
     */
    const mintCompanionNFT = async (companion) => {
      if (!companion) return;

      // Only custom companions can be minted
      if (!companion.isCustom) {
        alert(
          `${companion.name} is a built-in companion and cannot be minted as an NFT.`,
        );
        return;
      }

      const selectedNetwork = "base";

      // Validate contract address
      const contractAddress = CONFIG.companionNFT_BASE?.contractAddress;
      if (!contractAddress) {
        alert(
          "Base ERC-8004 companion contract not deployed yet. Coming soon!",
        );
        return;
      }

      // Local wallets are used - no CDP credentials needed

      isMintingNFT.value = true;
      mintingCompanionId.value = companion.id;
      mintResult.value = null;

      try {
        // Initialize Irys with connected wallet
        const provider = getEip1193Provider();
        if (!provider)
          throw new Error(
            "Wallet not connected. Please connect your wallet first.",
          );
        await irysService.getIrys(provider);

        // Upload companion image to Arweave via Irys
        let imageUri = companion.image || "";
        if (imageUri && imageUri.startsWith("data:image")) {
          console.log(
            "[NFT Mint] Uploading companion image to Arweave via Irys...",
          );

          // Check balance for image upload (metadata is free <100KB)
          const imageBytes = Math.ceil(imageUri.length * 0.75); // base64 → bytes estimate
          const cost = await irysService.estimateCost(imageBytes);
          const balance = await irysService.getBalance();
          if (parseFloat(balance) < parseFloat(cost)) {
            const needed = (
              parseFloat(cost) -
              parseFloat(balance) +
              0.0001
            ).toFixed(6);
            const ok = confirm(
              `Irys balance too low for image upload.\n\nCost: ~${cost} ETH\nBalance: ${balance} ETH\n\nFund ${needed} ETH to proceed?`,
            );
            if (!ok)
              throw new Error("Upload cancelled — insufficient Irys balance.");
            await irysService.fund(needed);
          }

          const imageReceipt = await irysService.uploadBase64({
            base64Data: imageUri,
            contentType: "image/webp",
          });
          imageUri = imageReceipt.gatewayUrl;
          console.log("[NFT Mint] Image uploaded:", imageUri);
        }

        // Pack spending habits for on-chain + OASF domain computation
        const spendingHabits =
          companion.spendingHabits ||
          companionService.generateSpendingProfile(companion);

        // Build ERC-8004 + OASF v0.8.0 registration JSON (replaces simple OpenSea metadata)
        const registration =
          companionService.buildERC8004RegistrationWithSpending(
            {
              name: companion.name,
              firstName: companion.firstName,
              familyName: companion.familyName,
              shortBio: companion.shortBio,
              description: companion.description,
              imageUri,
              personality: companion.personality,
              appearance: companion.appearance,
              background: companion.background,
              voiceStyle: companion.voiceStyle,
              firstMessage: companion.firstMessage,
              style: companion.style,
              gender:
                companion.gender === "female"
                  ? 1
                  : companion.gender === "male"
                    ? 2
                    : 0,
              age: companion.age,
              voiceId: companion.voiceId,
            },
            spendingHabits,
          );

        console.log(
          "[NFT Mint] Registration JSON:",
          JSON.stringify(registration, null, 2),
        );

        // Upload registration JSON to Arweave via Irys (free — under 100KB)
        console.log(
          "[NFT Mint] Uploading ERC-8004 registration to Arweave via Irys...",
        );
        const metadataReceipt = await irysService.uploadMetadata(registration);
        const metadataUri = metadataReceipt.gatewayUrl;
        console.log("[NFT Mint] Registration uploaded:", metadataUri);

        // Create personality hash from personality traits
        const personalityHash = companion.personality || companion.name;

        // Determine gender from companion data
        let genderValue = Gender.Neutral;
        if (companion.gender) {
          genderValue =
            companion.gender === "female"
              ? Gender.Female
              : companion.gender === "male"
                ? Gender.Male
                : Gender.Neutral;
        }

        console.log(`[NFT Mint] Minting on ${selectedNetwork}...`);

        const result = await companionService.mintCompanionMultiNetwork(
          {
            metadataURI: metadataUri,
            companionId: companion.id, // For agent wallet generation
            name: companion.name,
            description: companion.description,
            personality: personalityHash,
            personalityHash: personalityHash,
            imageUri: imageUri,
            spendingHabits,
            gender: genderValue,
            style: companion.style,
            age: companion.age,
            voiceId: companion.voiceId,
            firstName: companion.firstName,
            familyName: companion.familyName,
            appearance: companion.appearance,
            background: companion.background,
            voiceStyle: companion.voiceStyle,
            firstMessage: companion.firstMessage,
          },
          selectedNetwork,
        );

        mintResult.value = result;

        if (result.success) {
          console.log(
            `[NFT Mint] Success! Token ID: ${result.tokenId}, TX: ${result.txHash}`,
          );

          // Update companion with token ID and Base-specific data
          companion.tokenId = result.tokenId;
          companion.txHash = result.txHash;
          companion.network = "base";
          companion.standard = result.standard || "ERC-8004";

          // Store agent wallet info for ERC-8004 mints
          if (result.agentWallet) {
            companion.agentWallet = result.agentWallet;
            companion.x402Support = true;
            companion.agentWalletProvider =
              result.agentWalletProvider || "local";
            console.log(
              `[NFT Mint] Agent wallet: ${result.agentWallet} (${companion.agentWalletProvider})`,
            );
          }

          // Store spending habits if generated (Base mints)
          if (result.spendingHabits) {
            companion.spendingHabits = result.spendingHabits;
            console.log(`[NFT Mint] Spending habits generated for companion`);
          }

          // Update in companions array
          const idx = companions.value.findIndex((c) => c.id === companion.id);
          if (idx !== -1) {
            companions.value[idx].tokenId = result.tokenId;
            companions.value[idx].txHash = result.txHash;
            companions.value[idx].network = "base";
            companions.value[idx].standard = companion.standard;
            if (result.agentWallet) {
              companions.value[idx].agentWallet = result.agentWallet;
              companions.value[idx].x402Support = true;
              companions.value[idx].agentWalletProvider =
                result.agentWalletProvider || "local";
            }
            if (result.spendingHabits) {
              companions.value[idx].spendingHabits = result.spendingHabits;
            }
          }

          // Save updated companion to storage
          await saveCompanions();
        } else {
          console.error("[NFT Mint] Failed:", result.error);
          alert(`Minting failed: ${result.error}`);
        }
      } catch (e) {
        console.error("[NFT Mint] Error:", e.message);
        mintResult.value = { success: false, error: e.message };
        alert(`Minting failed: ${e.message}`);
      } finally {
        isMintingNFT.value = false;
        mintingCompanionId.value = null;
      }
    };

    /**
     * Deploy a Universal Profile on LUKSO for a minted companion (post-mint)
     */
    const deployUPForCompanion = async (companion) => {
      if (!isConnected.value) {
        alert("Please connect your wallet first.");
        return;
      }
      if (web3Service.state.currentChainId !== 42) {
        const ok = confirm(
          "Deploying a Universal Profile requires the LUKSO network. Switch to LUKSO now?",
        );
        if (!ok) return;
        try {
          await switchNetwork("lukso");
        } catch (e) {
          alert("Failed to switch to LUKSO: " + e.message);
          return;
        }
      }
      deployingUPForCompanionId.value = companion.id;
      try {
        const result = await companionService.deployCompanionUP(
          companion.id,
          companion,
        );
        companion.universalProfile = result.upAddress;
        // Update in companions array and save
        const idx = companions.value.findIndex((c) => c.id === companion.id);
        if (idx !== -1)
          companions.value[idx].universalProfile = result.upAddress;
        await saveCompanions();
        openExternal("https://universaleverything.io/" + result.upAddress);
      } catch (e) {
        alert("UP deployment failed: " + e.message);
      } finally {
        deployingUPForCompanionId.value = null;
      }
    };

    /**
     * Open external URL in default browser
     */
    const openExternal = (url) => {
      window.electronAPI?.openExternal?.(url);
    };

    /**
     * Launch a companion token on Base with Uniswap V2 liquidity
     * @param {Object} companion - The companion to launch token for
     */
    const launchCompanionToken = async (companion) => {
      if (!companion) return;

      // Validation
      if (!companion.tokenId) {
        alert("Companion must be minted as an NFT first.");
        return;
      }

      if (!companion.agentWallet) {
        alert("Companion must have an agentWallet to receive LP tokens.");
        return;
      }

      if (companion.tokenAddress) {
        alert(
          `Token already launched: $${companion.tokenSymbol || companion.firstName?.toUpperCase()}`,
        );
        return;
      }

      // Check if factory is configured
      if (!CONFIG.companionTokenFactory?.contractAddress) {
        alert("Companion token factory not deployed yet. Coming soon!");
        return;
      }

      const ethAmount = tokenLaunchEthAmounts.value[companion.id] || "0.01";
      if (parseFloat(ethAmount) < 0.01) {
        alert("Minimum 0.01 ETH required for liquidity.");
        return;
      }

      isLaunchingToken.value = true;
      launchingTokenCompanionId.value = companion.id;
      tokenLaunchResult.value = null;

      try {
        console.log(
          `[Token Launch] Launching $${companion.firstName?.toUpperCase()} for ${companion.name}...`,
        );

        const result = await companionTokenService.launchToken(
          companion,
          ethAmount,
        );
        tokenLaunchResult.value = result;

        if (result.success) {
          console.log(
            `[Token Launch] Success! Token: ${result.tokenAddress}, Pair: ${result.pairAddress}`,
          );

          // Update companion with token data
          companion.tokenAddress = result.tokenAddress;
          companion.pairAddress = result.pairAddress;
          companion.tokenSymbol = result.symbol;
          companion.tokenLaunchTx = result.txHash;
          companion.tokenLaunchDate = Date.now();
          companion.tokenLaunchEth = ethAmount;

          // Update in companions array
          const idx = companions.value.findIndex((c) => c.id === companion.id);
          if (idx !== -1) {
            companions.value[idx].tokenAddress = result.tokenAddress;
            companions.value[idx].pairAddress = result.pairAddress;
            companions.value[idx].tokenSymbol = result.symbol;
            companions.value[idx].tokenLaunchTx = result.txHash;
            companions.value[idx].tokenLaunchDate = Date.now();
            companions.value[idx].tokenLaunchEth = ethAmount;
          }

          // Save updated companion to storage
          await saveCompanions();

          alert(
            `$${result.symbol} launched! LP burned (unruggable). Trading live on Uniswap V2.`,
          );
        } else {
          console.error("[Token Launch] Failed:", result.error);
          alert(`Token launch failed: ${result.error}`);
        }
      } catch (e) {
        console.error("[Token Launch] Error:", e.message);
        tokenLaunchResult.value = { success: false, error: e.message };
        alert(`Token launch failed: ${e.message}`);
      } finally {
        isLaunchingToken.value = false;
        launchingTokenCompanionId.value = null;
      }
    };

    /**
     * Get Uniswap trade URL for a token
     * @param {string} tokenAddress - Token address
     * @returns {string} Uniswap swap URL
     */
    const getUniswapTradeUrl = (tokenAddress) => {
      return companionTokenService.getUniswapTradeUrl(tokenAddress);
    };

    /**
     * Get BaseScan URL for a token
     * @param {string} tokenAddress - Token address
     * @returns {string} BaseScan URL
     */
    const getBaseScanUrl = (tokenAddress) => {
      return companionTokenService.getBaseScanUrl(tokenAddress);
    };

    /**
     * Sync history with the store after user sends a message
     * This keeps the store in sync when user is actively chatting
     */
    const syncHistoryWithStore = () => {
      if (
        skillStore.autonomousMode &&
        skillStore.autonomousSession.sessionKey === currentSessionKey.value
      ) {
        skillStore.syncAutonomousHistory(
          chatHistory.value,
          sceneState.value,
          scenarioBackgroundImage.value,
          backgroundHistory.value,
        );
      }
    };

    /**
     * Sync from store - pull any messages generated while component was unmounted
     */
    const syncFromStore = () => {
      const storeData = skillStore.getAutonomousSessionData();
      if (
        storeData.sessionKey &&
        storeData.sessionKey === currentSessionKey.value
      ) {
        // Store has messages for this session - merge them
        if (storeData.history.length > chatHistory.value.length) {
          console.log(
            `[Roleplay] Syncing ${storeData.history.length - chatHistory.value.length} messages from store`,
          );
          chatHistory.value = [...storeData.history];
          sceneState.value = { ...storeData.sceneState };
          // Sync background image and history from store
          if (storeData.backgroundImage) {
            scenarioBackgroundImage.value = storeData.backgroundImage;
          }
          if (storeData.backgroundHistory?.length) {
            backgroundHistory.value = [...storeData.backgroundHistory];
          }
          scrollToBottom();
        }
      }
    };

    /**
     * Clear missed messages via store
     */
    const clearMissedMessages = () => {
      skillStore.clearMissedMessages();
    };

    // Watch for autonomous session changes (messages generated while viewing)
    watch(
      () => skillStore.autonomousSession.history.length,
      (newLen, oldLen) => {
        // If store has new messages and we're viewing this session
        if (
          phase.value === "chat" &&
          skillStore.autonomousSession.sessionKey === currentSessionKey.value &&
          newLen > chatHistory.value.length
        ) {
          syncFromStore();
        }
      },
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // IMPORT/EXPORT SESSIONS
    // ═══════════════════════════════════════════════════════════════════════════

    const triggerImportSession = () => {
      importInput.value?.click();
    };

    const handleImportSession = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const importedData = JSON.parse(text);

        // Check if it's a single session or multiple sessions
        if (importedData.sessions) {
          // Multiple sessions export format
          const sessions = importedData.sessions;
          let importedCount = 0;

          for (const [key, session] of Object.entries(sessions)) {
            if (session.companion && session.scenario && session.history) {
              savedSessions.value[key] = session;
              importedCount++;
            }
          }

          // Also import companions if present
          if (
            importedData.customCompanions &&
            Array.isArray(importedData.customCompanions)
          ) {
            for (const companion of importedData.customCompanions) {
              const existingIdx = companions.value.findIndex(
                (c) => c.name.toLowerCase() === companion.name.toLowerCase(),
              );
              if (existingIdx < 0) {
                companions.value.push(companion);
              }
            }
            await saveCompanions();
          }

          // Save sessions to store
          if (window.electronAPI?.store?.set) {
            const plainSessions = JSON.parse(
              JSON.stringify(toRaw(savedSessions.value)),
            );
            await window.electronAPI.store.set(STORAGE_KEY, plainSessions);
          }

          console.log(`[Roleplay] Imported ${importedCount} sessions`);
          alert(`Successfully imported ${importedCount} session(s)`);
        } else if (importedData.companion && importedData.scenario) {
          // Single session format
          const key = getSessionKey(
            importedData.companion,
            importedData.scenario,
            importedData.settings?.contentLevel || "pg13",
            importedData.settings?.responseMode || "text+image",
          );

          if (key) {
            savedSessions.value[key] = importedData;

            if (window.electronAPI?.store?.set) {
              const plainSessions = JSON.parse(
                JSON.stringify(toRaw(savedSessions.value)),
              );
              await window.electronAPI.store.set(STORAGE_KEY, plainSessions);
            }

            console.log(`[Roleplay] Imported session: ${key}`);
            alert(
              `Successfully imported session with ${importedData.companion.name}`,
            );
          }
        } else {
          alert("Invalid session file format");
        }
      } catch (e) {
        console.error("[Roleplay] Import failed:", e);
        alert(`Import failed: ${e.message}`);
      }

      // Reset input
      event.target.value = "";
    };

    const exportSession = (key) => {
      const session = savedSessions.value[key];
      if (!session) return;

      const exportData = {
        ...session,
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roleplay-${session.companion?.name?.toLowerCase().replace(/\s+/g, "-") || "session"}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log(`[Roleplay] Exported session: ${key}`);
    };

    const exportAllSessions = () => {
      const exportData = {
        sessions: structuredClone(toRaw(savedSessions.value)),
        customCompanions: structuredClone(toRaw(companions.value)),
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roleplay-all-sessions-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log(`[Roleplay] Exported all sessions`);
    };

    // Resume a specific session
    const resumeSession = async (key) => {
      if (await loadSession(key)) {
        phase.value = "chat";
        showSessionManager.value = false;
        suggestedResponses.value = [];
        nextTick(() => {
          chatInput.value?.focus();
          scrollToBottom();
          setTimeout(() => scrollToBottom(), 500);
        });
      }
    };

    // Parse session key to get human-readable info
    const parseSessionKey = (key) => {
      const parts = key.split("__");
      return {
        companionId: parts[0] || "",
        scenarioId: parts[1] || "",
        contentLevel: parts[2] || "",
        responseMode: parts[3] || "",
      };
    };

    // Get formatted date for session
    const formatSessionDate = (timestamp) => {
      if (!timestamp) return "";
      const date = new Date(timestamp);
      return (
        date.toLocaleDateString() +
        " " +
        date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    };

    // Unified companions and scenarios lists (all user-created)
    // Storage keys
    const COMPANIONS_KEY = "roleplayCompanions";
    const SCENARIOS_KEY = "roleplayScenarios";

    // Reactive lists
    const companions = ref([]);
    const isLoadingNFTCompanions = ref(false);
    const scenarios = ref([]);
    const contentLevels = CONTENT_LEVELS;

    // Load companions from storage, seeding defaults on first run or after update
    const loadCompanions = async () => {
      try {
        if (window.electronAPI?.store?.get) {
          const stored = await window.electronAPI.store.get(
            COMPANIONS_KEY,
            null,
          );

          // Get default companion IDs for migration check
          const defaultIds = DEFAULT_COMPANIONS.map((c) => c.id);
          const defaultsById = Object.fromEntries(
            DEFAULT_COMPANIONS.map((c) => [c.id, c]),
          );

          if (stored && stored.length > 0) {
            // Validate companions, auto-migrate ages 18-20 → 21, sanitize
            // Also ensure isCustom flag is properly set for all companions
            // AND merge new properties from defaults onto existing built-in companions
            let needsSave = false;
            const validCompanions = stored.filter((c) => {
              // Auto-migrate companions with age 18-20 to 21 (minimum raised)
              const numAge = typeof c.age === 'number' ? c.age : parseInt(c.age, 10);
              if (!isNaN(numAge) && numAge >= 18 && numAge < 21) {
                console.log(`[Roleplay] Migrating companion "${c.name}" age ${numAge} → 21`);
                c.age = 21;
                needsSave = true;
              }

              // Auto-migrate age references in text fields (18-20 → 21)
              // so existing custom companions aren't silently filtered out
              const textFields = ['description', 'appearance', 'personality'];
              for (const field of textFields) {
                if (c[field] && typeof c[field] === 'string') {
                  const migrated = c[field].replace(
                    /\b(1[89]|20)\s*(years?\s*old|yo\b|y\.o\.)/gi,
                    '21 years old'
                  );
                  if (migrated !== c[field]) {
                    console.log(`[Roleplay] Migrated age reference in ${c.name}'s ${field}`);
                    c[field] = migrated;
                    needsSave = true;
                  }
                }
              }

              const validation = validateCompanionAge(c);
              if (!validation.valid) {
                console.warn(
                  `[Roleplay] Removed invalid companion "${c.name}": ${validation.reason}`,
                );
                return false;
              }
              sanitizeCompanionAge(c);
              // Ensure isCustom flag is set correctly:
              // - Companions not in DEFAULT_COMPANIONS are custom
              // - Companions in DEFAULT_COMPANIONS are built-in (isCustom = false)
              if (!defaultIds.includes(c.id)) {
                c.isCustom = true;
                // Generate spending profile for custom companions if missing or has default values
                if (
                  !c.spendingHabits ||
                  isDefaultSpendingProfile(c.spendingHabits)
                ) {
                  c.spendingHabits = generateSpendingProfile(c);
                  needsSave = true;
                  console.log(
                    `[Roleplay] Generated spending profile for ${c.name}`,
                  );
                }
                // Generate firstName/familyName from name if missing
                if (!c.firstName && c.name) {
                  const nameParts = c.name.trim().split(/\s+/);
                  c.firstName = nameParts[0];
                  if (nameParts.length > 1) {
                    c.familyName = nameParts.slice(1).join(" ");
                  }
                  needsSave = true;
                }
              } else {
                c.isCustom = false;
                // Merge new properties from defaults (preserve user's image)
                const defaultCompanion = defaultsById[c.id];
                if (defaultCompanion) {
                  const userImage = c.image; // Preserve user's generated image
                  // Add any missing properties from default
                  for (const key of Object.keys(defaultCompanion)) {
                    if (
                      !(key in c) ||
                      c[key] === undefined ||
                      c[key] === null
                    ) {
                      c[key] = defaultCompanion[key];
                      needsSave = true;
                    }
                  }
                  // Always update spendingHabits and shortBio from defaults (schema changes)
                  if (
                    defaultCompanion.spendingHabits &&
                    JSON.stringify(c.spendingHabits) !==
                      JSON.stringify(defaultCompanion.spendingHabits)
                  ) {
                    c.spendingHabits = { ...defaultCompanion.spendingHabits };
                    needsSave = true;
                  }
                  if (
                    defaultCompanion.shortBio &&
                    c.shortBio !== defaultCompanion.shortBio
                  ) {
                    c.shortBio = defaultCompanion.shortBio;
                    needsSave = true;
                  }
                  if (
                    defaultCompanion.familyName &&
                    c.familyName !== defaultCompanion.familyName
                  ) {
                    c.familyName = defaultCompanion.familyName;
                    needsSave = true;
                  }
                  if (
                    defaultCompanion.firstName &&
                    c.firstName !== defaultCompanion.firstName
                  ) {
                    c.firstName = defaultCompanion.firstName;
                    needsSave = true;
                  }
                  c.image = userImage; // Restore user's image
                }
              }
              return true;
            });

            // Check if any default companions are missing (migration after update)
            const storedIds = validCompanions.map((c) => c.id);
            const missingDefaults = DEFAULT_COMPANIONS.filter(
              (dc) => !storedIds.includes(dc.id),
            );

            if (missingDefaults.length > 0) {
              // Add missing defaults (preserving user's existing companions)
              console.log(
                `[Roleplay] Adding ${missingDefaults.length} new default companions`,
              );
              const newDefaults = missingDefaults.map((c) => ({
                ...c,
                image: resolveBundledAsset(c.defaultImage),
                isCustom: false, // Default companions are not custom
              }));
              companions.value = [...validCompanions, ...newDefaults];
              await saveCompanions();
            } else {
              companions.value = validCompanions;
              // Save if any properties were merged from defaults
              if (needsSave) {
                await saveCompanions();
                console.log(
                  `[Roleplay] Migrated companions with new properties`,
                );
              }
            }

            console.log(
              `[Roleplay] Loaded ${companions.value.length} companions`,
            );

            // Save if any were filtered out
            if (validCompanions.length !== stored.length) {
              await saveCompanions();
              console.log(
                `[Roleplay] Cleaned up ${stored.length - validCompanions.length} invalid companions`,
              );
            }

            // Hydrate Universal Profile addresses from Electron store
            for (const c of companions.value) {
              if (c.tokenId && !c.universalProfile) {
                try {
                  const upData = await agentWalletService.getCompanionUP(c.id);
                  if (upData?.upAddress) c.universalProfile = upData.upAddress;
                } catch (_) {
                  /* ignore */
                }
              }
            }

            // Shuffle companions for random order each session
            shuffleCompanions();
          } else {
            // First run - seed with defaults
            companions.value = DEFAULT_COMPANIONS.map((c) => ({
              ...c,
              image: null,
              isCustom: false, // Default companions are not custom
            }));
            await saveCompanions();
            console.log(
              `[Roleplay] Seeded ${companions.value.length} default companions`,
            );
            // Shuffle companions for random order
            shuffleCompanions();
          }
        } else {
          companions.value = DEFAULT_COMPANIONS.map((c) => ({
            ...c,
            image: resolveBundledAsset(c.defaultImage),
            isCustom: false, // Default companions are not custom
          }));
          shuffleCompanions();
        }
      } catch (e) {
        console.error("[Roleplay] Failed to load companions:", e);
        companions.value = DEFAULT_COMPANIONS.map((c) => ({
          ...c,
          image: resolveBundledAsset(c.defaultImage),
          isCustom: false, // Default companions are not custom
        }));
        shuffleCompanions();
      }
    };

    // Load NFT companions owned by the connected wallet
    const loadNFTCompanions = async () => {
      if (!walletAddress.value || !CONFIG.companionNFT_BASE?.contractAddress)
        return;

      try {
        isLoadingNFTCompanions.value = true;
        const nftCompanions = await companionService.loadOwnedCompanions(
          walletAddress.value,
        );
        if (!nftCompanions.length) return;

        // Deduplicate: skip NFTs whose tokenId matches an existing local companion
        const existingTokenIds = new Set(
          companions.value
            .filter((c) => c.tokenId != null)
            .map((c) => c.tokenId),
        );

        const newCompanions = nftCompanions.filter(
          (c) => !existingTokenIds.has(c.tokenId),
        );

        if (newCompanions.length > 0) {
          // Resolve bundled default images for bare companions
          for (const c of newCompanions) {
            if (!c.image && c.defaultImage) {
              c.image = resolveBundledAsset(c.defaultImage);
            }
          }
          companions.value = [...companions.value, ...newCompanions];
          console.log(
            `[Roleplay] Added ${newCompanions.length} NFT companions`,
          );

          // Re-render spending charts for new companions
          setTimeout(() => renderSpendingCharts(), 100);
        }
      } catch (e) {
        console.warn("[Roleplay] Failed to load NFT companions:", e);
      } finally {
        isLoadingNFTCompanions.value = false;
      }
    };

    // Fisher-Yates shuffle for random companion order
    const shuffleCompanions = () => {
      const arr = companions.value;
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      companions.value = [...arr];
    };

    // Load scenarios from storage, seeding defaults on first run or after update
    const loadScenarios = async () => {
      try {
        if (window.electronAPI?.store?.get) {
          const stored = await window.electronAPI.store.get(
            SCENARIOS_KEY,
            null,
          );

          // Get default scenario IDs for migration check
          const defaultIds = DEFAULT_SCENARIOS.map((s) => s.id);

          if (stored && stored.length > 0) {
            // Check if any default scenarios are missing (migration after update)
            const storedIds = stored.map((s) => s.id);
            const missingDefaults = DEFAULT_SCENARIOS.filter(
              (ds) => !storedIds.includes(ds.id),
            );

            if (missingDefaults.length > 0) {
              // Add missing defaults (preserving user's existing scenarios)
              console.log(
                `[Roleplay] Adding ${missingDefaults.length} new default scenarios`,
              );
              const newDefaults = missingDefaults.map((s) => ({
                ...s,
                image: resolveBundledAsset(s.defaultImage),
              }));
              scenarios.value = [...stored, ...newDefaults];
              await saveScenarios();
            } else {
              scenarios.value = stored;
            }

            console.log(
              `[Roleplay] Loaded ${scenarios.value.length} scenarios`,
            );
          } else {
            // First run - seed with defaults
            scenarios.value = DEFAULT_SCENARIOS.map((s) => ({
              ...s,
              image: resolveBundledAsset(s.defaultImage),
            }));
            await saveScenarios();
            console.log(
              `[Roleplay] Seeded ${scenarios.value.length} default scenarios`,
            );
          }
        } else {
          scenarios.value = DEFAULT_SCENARIOS.map((s) => ({
            ...s,
            image: resolveBundledAsset(s.defaultImage),
          }));
        }
      } catch (e) {
        console.error("[Roleplay] Failed to load scenarios:", e);
        scenarios.value = DEFAULT_SCENARIOS.map((s) => ({
          ...s,
          image: resolveBundledAsset(s.defaultImage),
        }));
      }
    };

    // Save companions to storage (exclude NFT companions — loaded fresh from chain)
    const saveCompanions = async () => {
      try {
        if (window.electronAPI?.store?.set) {
          const localCompanions = companions.value.filter((c) => !c.isNFT);
          await window.electronAPI.store.set(
            COMPANIONS_KEY,
            structuredClone(toRaw(localCompanions)),
          );
          console.log(
            `[Roleplay] Saved ${localCompanions.length} companions (${companions.value.length - localCompanions.length} NFT excluded)`,
          );
        }
      } catch (e) {
        console.error("[Roleplay] Failed to save companions:", e);
      }
    };

    // Save scenarios to storage
    const saveScenarios = async () => {
      try {
        if (window.electronAPI?.store?.set) {
          await window.electronAPI.store.set(
            SCENARIOS_KEY,
            structuredClone(toRaw(scenarios.value)),
          );
          console.log(`[Roleplay] Saved ${scenarios.value.length} scenarios`);
        }
      } catch (e) {
        console.error("[Roleplay] Failed to save scenarios:", e);
      }
    };

    // Computed
    const canStart = computed(() => {
      return (
        selectedCompanion.value && selectedScenario.value && canStartChat.value
      );
    });

    // Scenario background style computed
    // Track visible message index for scroll-based background
    const visibleMessageIndex = ref(0);

    // Get the appropriate background for the current scroll position
    const getBackgroundForIndex = (index) => {
      if (!backgroundHistory.value.length) return scenarioBackgroundImage.value;
      // Find the most recent background at or before the given index
      let bg = null;
      for (const entry of backgroundHistory.value) {
        if (entry.messageIndex <= index) {
          bg = entry.image;
        } else {
          break;
        }
      }
      return bg || scenarioBackgroundImage.value;
    };

    // Handle scroll to update visible background based on message anchors (debounced)
    // This creates an immersive experience where scenery changes as you scroll through history
    let scrollTimeout = null;
    let _scrollRafId = 0;
    const onMessagesScroll = (event) => {
      // RAF throttle to avoid firing on every scroll frame
      if (_scrollRafId) return;
      _scrollRafId = requestAnimationFrame(() => {
        _scrollRafId = 0;
        _onMessagesScrollInner(event);
      });
    };
    const _onMessagesScrollInner = (event) => {
      // Debounce scroll handler to prevent excessive updates
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const container = event.target;
        const messages = container.querySelectorAll(".chat-message");
        if (!messages.length || !backgroundHistory.value.length) return;

        // Find the message closest to the top of the visible area
        const containerTop = container.scrollTop;
        let closestIndex = 0;
        let closestDistance = Infinity;

        messages.forEach((msg, idx) => {
          const distance = Math.abs(msg.offsetTop - containerTop);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = idx;
          }
        });

        if (closestIndex !== visibleMessageIndex.value) {
          visibleMessageIndex.value = closestIndex;
          // Update background based on the message anchor (scene/location change)
          const bgForIndex = getBackgroundForIndex(closestIndex);
          if (bgForIndex && bgForIndex !== scenarioBackgroundImage.value) {
            scenarioBackgroundImage.value = bgForIndex;
          }
        }
      }, 150); // 150ms debounce for smooth experience
    };

    const scenarioBackgroundStyle = computed(() => {
      if (!scenarioBackgroundImage.value) return {};
      const imageSrc = getImageSrc(scenarioBackgroundImage.value);
      return {
        backgroundImage: `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.6)), url(${imageSrc})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
    });

    // Methods
    const toggleMediaOption = (option, modelKey) => {
      // If model isn't available, start download instead of toggling
      if (!isModelAvailable(modelKey)) {
        // Check if it's a Flask pipeline model
        if (PIPELINE_MAP[modelKey]) {
          downloadPipeline(modelKey);
        }
        return;
      }
      settings.value[option] = !settings.value[option];
    };

    const downloadMissingOptional = async () => {
      for (const modelKey of missingOptional.value) {
        if (PIPELINE_MAP[modelKey]) {
          await downloadPipeline(modelKey);
        }
      }
      // Scroll to top where download progress shows
      const el = document.querySelector(".roleplay-setup");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    };

    const getAvatarIcon = (avatar, gender) => {
      // Robot/android companions use agender icon
      if (avatar === "android" || avatar === "smart_toy") {
        return "agender";
      }
      // Use gender-based icons for human-like companions
      if (gender === "female" || avatar === "woman") {
        return "female";
      }
      if (
        gender === "male" ||
        avatar === "man" ||
        avatar === "soldier" ||
        avatar === "demon"
      ) {
        return "male";
      }
      // Fallback
      return "person";
    };

    const selectCompanion = async (companion) => {
      // Age validation safeguard
      const ageValidation = validateCompanionAge(companion);
      if (!ageValidation.valid) {
        alert(`Cannot select companion: ${ageValidation.reason}`);
        // Remove invalid companion from the list
        const idx = companions.value.findIndex((c) => c.id === companion.id);
        if (idx >= 0) {
          companions.value.splice(idx, 1);
          await saveCompanions();
        }
        return;
      }

      selectedCompanion.value = companion;
      showCustomCompanion.value = false;
      // Sessions are now shown via companionSessions computed property

      // Reset Moltbook/social state when switching companions
      moltbookRegistrationResult.value = null;
      moltbookMode.value = "register";
      showMoltbookKeyInput.value = false;

      // Load Moltbook credentials for this companion
      await loadMoltbookCredentials();

      // Load x402 agent wallet for this companion
      await loadAgentWallet();
      await loadTransactionHistory();
    };

    const selectScenario = (scenario) => {
      selectedScenario.value = scenario;
      showCustomScenario.value = false;
    };

    const openCustomCompanion = () => {
      showCustomCompanion.value = true;
    };

    const openCustomScenario = () => {
      showCustomScenario.value = true;
    };

    const cancelCustomCompanion = () => {
      generationCancelled.value = true;
      isGenerating.value = false;
      typingStatus.value = "";
      customCompanion.value = null;
      showCustomCompanion.value = false;
      generationError.value = null;
    };

    const cancelCustomScenario = () => {
      generationCancelled.value = true;
      isGenerating.value = false;
      typingStatus.value = "";
      customScenario.value = null;
      showCustomScenario.value = false;
      generationError.value = null;
    };

    const generateCustomCompanion = async () => {
      if (!customCompanionPrompt.value || isGenerating.value) return;
      isGenerating.value = true;
      generationError.value = null;
      generationCancelled.value = false;
      customCompanion.value = null; // Clear any previous

      try {
        // Use progressive generation with real-time updates
        const result =
          await roleplayCompanion.execution.generateCompanionProgressive(
            {
              description: customCompanionPrompt.value,
              style: customCompanionStyle.value,
              gender: customCompanionGender.value,
              onProgress: (update) => {
                console.log(
                  "[Roleplay] Progress:",
                  update.phase,
                  update.message,
                );
                typingStatus.value = update.message || "";

                // Update the preview card in real-time
                if (update.companion) {
                  customCompanion.value = { ...update.companion };
                }

                // Check for cancellation
                if (generationCancelled.value) {
                  throw new Error("Generation cancelled");
                }
              },
            },
            { updateStatus: (s) => console.log("[Roleplay]", s) },
          );

        if (generationCancelled.value) return;

        // Age validation - reject underage companions
        const ageValidation = validateCompanionAge(result);
        if (!ageValidation.valid) {
          generationError.value = `Cannot create companion: ${ageValidation.reason}`;
          customCompanion.value = null;
          isGenerating.value = false;
          typingStatus.value = "";
          return;
        }

        // Sanitize age to ensure it's at least 18
        sanitizeCompanionAge(result);

        // Generate companion portrait image using /image/quality (square)
        try {
          if (generationCancelled.value) return;
          const { generateCompanionPicture } =
            await import("../../skills/flagship.js");
          typingStatus.value = "Generating portrait...";

          const imageResult = await generateCompanionPicture(result, {
            width: 768,
            height: 768, // Square for companion portraits
            style: "professional portrait photography",
          });

          if (generationCancelled.value) return;

          if (imageResult.success && imageResult.image) {
            result.image = imageResult.image;
            console.log(`[Roleplay] Generated portrait for ${result.name}`);
          }
        } catch (imgErr) {
          console.warn(
            "[Roleplay] Portrait generation failed:",
            imgErr.message,
          );
        }

        if (generationCancelled.value) return;
        customCompanion.value = result;
      } catch (e) {
        console.error("[Roleplay] Failed to generate companion:", e);
        if (!generationCancelled.value) {
          generationError.value = `Failed to generate companion: ${e.message}`;
        }
      } finally {
        isGenerating.value = false;
        typingStatus.value = "";
      }
    };

    const useCustomCompanion = async () => {
      if (customCompanion.value) {
        // Final age validation safeguard
        const ageValidation = validateCompanionAge(customCompanion.value);
        if (!ageValidation.valid) {
          alert(`Cannot use companion: ${ageValidation.reason}`);
          return;
        }

        // Add to companions list if not already there
        const existingIdx = companions.value.findIndex(
          (c) => c.id === customCompanion.value.id,
        );
        if (existingIdx === -1) {
          companions.value.push({ ...customCompanion.value });
          await saveCompanions();
          console.log(
            `[Roleplay] Added custom companion to list: ${customCompanion.value.name}`,
          );
        }

        selectedCompanion.value = customCompanion.value;
        showCustomCompanion.value = false;
        customCompanion.value = null;
        customCompanionPrompt.value = "";
      }
    };

    const generateCustomScenario = async () => {
      if (!customScenarioPrompt.value || isGenerating.value) return;
      isGenerating.value = true;
      generationError.value = null;
      generationCancelled.value = false;
      customScenario.value = null; // Clear any previous

      try {
        // Use progressive generation with real-time updates
        const result =
          await roleplayCompanion.execution.generateScenarioProgressive(
            {
              description: customScenarioPrompt.value,
              mood: customScenarioMood?.value || "romantic",
              onProgress: (update) => {
                console.log(
                  "[Roleplay] Scenario progress:",
                  update.phase,
                  update.message,
                );
                typingStatus.value = update.message || "";

                // Update the preview card in real-time
                if (update.scenario) {
                  customScenario.value = { ...update.scenario };
                }

                // Check for cancellation
                if (generationCancelled.value) {
                  throw new Error("Generation cancelled");
                }
              },
            },
            { updateStatus: (s) => console.log("[Roleplay]", s) },
          );

        if (generationCancelled.value) return;

        // Generate scenario background image using /image/turbo (landscape)
        try {
          if (generationCancelled.value) return;
          const { generateScenarioPicture } =
            await import("../../skills/flagship.js");
          typingStatus.value = "Generating scene...";

          const imageResult = await generateScenarioPicture(result, {
            width: 1024,
            height: 576, // Landscape for scenario backgrounds (16:9)
            style: "cinematic environment",
          });

          if (generationCancelled.value) return;

          if (imageResult.success && imageResult.image) {
            result.image = imageResult.image;
            console.log(`[Roleplay] Generated scene for ${result.name}`);
          }
        } catch (imgErr) {
          console.warn("[Roleplay] Scene generation failed:", imgErr.message);
        }

        if (generationCancelled.value) return;
        customScenario.value = result;
      } catch (e) {
        console.error("[Roleplay] Failed to generate scenario:", e);
        if (!generationCancelled.value) {
          generationError.value = `Failed to generate scenario: ${e.message}`;
        }
      } finally {
        isGenerating.value = false;
        typingStatus.value = "";
      }
    };

    const useCustomScenario = async () => {
      if (customScenario.value) {
        // Add to scenarios list if not already there
        const existingIdx = scenarios.value.findIndex(
          (s) => s.id === customScenario.value.id,
        );
        if (existingIdx === -1) {
          scenarios.value.push({ ...customScenario.value });
          await saveScenarios();
          console.log(
            `[Roleplay] Added custom scenario to list: ${customScenario.value.name}`,
          );
        }

        selectedScenario.value = customScenario.value;
        showCustomScenario.value = false;
        customScenario.value = null;
        customScenarioPrompt.value = "";
      }
    };

    // State for image regeneration
    const isRegeneratingImage = ref(false);
    const regeneratingId = ref(null);

    // Spending chart canvas refs
    const spendingChartRefs = ref({});

    // Draw spider/radar chart for spending habits
    const drawSpendingChart = (canvas, spendingHabits) => {
      if (!canvas || !spendingHabits) return;

      const ctx = canvas.getContext("2d");
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2 - 65; // More padding for labels

      // Categories to display (full labels)
      const categories = [
        { key: "education", label: "Education" },
        { key: "entertainment", label: "Entertainment" },
        { key: "fashion", label: "Fashion" },
        { key: "finance", label: "Finance" },
        { key: "food", label: "Food" },
        { key: "healthcare", label: "Healthcare" },
        { key: "housing", label: "Housing" },
        { key: "beauty", label: "Beauty" },
        { key: "reading", label: "Reading" },
        { key: "social", label: "Social" },
        { key: "travel", label: "Travel" },
        { key: "sports", label: "Sports" },
      ];

      const numCategories = categories.length;
      const angleStep = (2 * Math.PI) / numCategories;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw background grid (concentric circles)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1;
      for (let i = 1; i <= 5; i++) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, (radius * i) / 5, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // Draw axis lines and labels
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.font = "bold 11px sans-serif";
      ctx.textBaseline = "middle";

      for (let i = 0; i < numCategories; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);

        // Axis line
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.stroke();

        // Label - position based on angle for better alignment
        const labelRadius = radius + 20;
        const labelX = centerX + labelRadius * Math.cos(angle);
        const labelY = centerY + labelRadius * Math.sin(angle);

        // Adjust text alignment based on position
        if (Math.abs(Math.cos(angle)) < 0.1) {
          ctx.textAlign = "center";
        } else if (Math.cos(angle) > 0) {
          ctx.textAlign = "left";
        } else {
          ctx.textAlign = "right";
        }

        ctx.fillText(categories[i].label, labelX, labelY);
      }

      // Draw data polygon
      ctx.beginPath();
      ctx.fillStyle = "rgba(138, 43, 226, 0.3)";
      ctx.strokeStyle = "rgba(138, 43, 226, 0.8)";
      ctx.lineWidth = 1;

      for (let i = 0; i < numCategories; i++) {
        const value = spendingHabits[categories[i].key] || 5;
        const normalizedValue = value / 10; // Values are 1-10
        const angle = i * angleStep - Math.PI / 2;
        const x = centerX + radius * normalizedValue * Math.cos(angle);
        const y = centerY + radius * normalizedValue * Math.sin(angle);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Draw data points
      ctx.fillStyle = "rgba(138, 43, 226, 1)";
      for (let i = 0; i < numCategories; i++) {
        const value = spendingHabits[categories[i].key] || 5;
        const normalizedValue = value / 10;
        const angle = i * angleStep - Math.PI / 2;
        const x = centerX + radius * normalizedValue * Math.cos(angle);
        const y = centerY + radius * normalizedValue * Math.sin(angle);

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    };

    // Render all spending charts after companions are loaded
    const renderSpendingCharts = () => {
      requestAnimationFrame(() => {
        companions.value.forEach((companion) => {
          if (
            companion.spendingHabits &&
            spendingChartRefs.value[companion.id]
          ) {
            drawSpendingChart(
              spendingChartRefs.value[companion.id],
              companion.spendingHabits,
            );
          }
        });
      });
    };

    /**
     * Regenerate companion portrait image (uses /image/quality)
     */
    const regenerateCompanionImage = async (companion) => {
      if (!companion || isRegeneratingImage.value) return;
      isRegeneratingImage.value = true;
      regeneratingId.value = companion.id;

      try {
        const { generateCompanionPicture } =
          await import("../../skills/flagship.js");

        const imageResult = await generateCompanionPicture(companion, {
          width: 768,
          height: 768,
          style: "professional portrait photography",
        });

        if (imageResult.success && imageResult.image) {
          companion.image = imageResult.image;

          // Update in companions list
          const idx = companions.value.findIndex((c) => c.id === companion.id);
          if (idx >= 0) {
            companions.value[idx].image = imageResult.image;
            await saveCompanions();
          }

          // Update selected companion if it's the same
          if (selectedCompanion.value?.id === companion.id) {
            selectedCompanion.value = { ...companion };
          }

          console.log(`[Roleplay] Regenerated portrait for ${companion.name}`);
        }
      } catch (e) {
        console.error("[Roleplay] Failed to regenerate companion image:", e);
      } finally {
        isRegeneratingImage.value = false;
        regeneratingId.value = null;
      }
    };

    /**
     * Regenerate spending profile based on companion personality
     */
    const regenerateSpendingProfile = async (companion) => {
      if (!companion) return;

      // Generate new spending profile from personality
      const newProfile = generateSpendingProfile(companion);
      companion.spendingHabits = newProfile;

      // Update in companions list
      const idx = companions.value.findIndex((c) => c.id === companion.id);
      if (idx >= 0) {
        companions.value[idx].spendingHabits = newProfile;
        await saveCompanions();
      }

      // Update selected companion if it's the same
      if (selectedCompanion.value?.id === companion.id) {
        selectedCompanion.value = { ...companion };
      }

      // Redraw the spider chart
      setTimeout(() => {
        if (spendingChartRefs.value[companion.id]) {
          drawSpendingChart(spendingChartRefs.value[companion.id], newProfile);
        }
      }, 50);

      console.log(
        `[Roleplay] Regenerated spending profile for ${companion.name}:`,
        newProfile,
      );
    };

    /**
     * Regenerate scenario background image (uses /image/turbo)
     */
    const regenerateScenarioImage = async (scenario) => {
      if (!scenario || isRegeneratingImage.value) return;
      isRegeneratingImage.value = true;
      regeneratingId.value = scenario.id;

      try {
        const { generateScenarioPicture } =
          await import("../../skills/flagship.js");

        const imageResult = await generateScenarioPicture(scenario, {
          width: 1024,
          height: 576,
          style: "cinematic environment",
        });

        if (imageResult.success && imageResult.image) {
          scenario.image = imageResult.image;

          // Update in scenarios list
          const idx = scenarios.value.findIndex((s) => s.id === scenario.id);
          if (idx >= 0) {
            scenarios.value[idx].image = imageResult.image;
            await saveScenarios();
          }

          // Update selected scenario if it's the same
          if (selectedScenario.value?.id === scenario.id) {
            selectedScenario.value = { ...scenario };
          }

          console.log(`[Roleplay] Regenerated scene for ${scenario.name}`);
        }
      } catch (e) {
        console.error("[Roleplay] Failed to regenerate scenario image:", e);
      } finally {
        isRegeneratingImage.value = false;
        regeneratingId.value = null;
      }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // COMPANION VOICE GENERATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Generate a voice sample for a companion using Qwen3-TTS voice design
     * The sample is stored with the companion and reused to initialize voice for each session
     */
    const generateCompanionVoice = async (companion) => {
      if (!companion || isGeneratingVoice.value) return;
      isGeneratingVoice.value = true;
      generatingVoiceId.value = companion.id;

      try {
        // Build voice description from companion attributes
        const ageGroup =
          companion.age < 30
            ? "young"
            : companion.age < 45
              ? "adult"
              : "mature";
        const genderVoice = companion.gender === "male" ? "male" : "female";

        // Extract voice characteristics from voiceStyle
        const voiceStyle = companion.voiceStyle || "";
        const accentMatch = voiceStyle.match(/(\w+)\s+accent/i);
        const accent = accentMatch ? accentMatch[1] : "";

        // Build voice design instruction
        const instruct = `A ${ageGroup} ${genderVoice} voice${accent ? ` with a ${accent} accent` : ""}. ${voiceStyle}`;

        // Sample text that showcases the voice
        const sampleText =
          companion.firstMessage ||
          `Hello, I'm ${companion.name}. ${companion.description || "It's wonderful to meet you."}`;

        console.log(
          `[Roleplay] Generating voice for ${companion.name}: ${instruct}`,
        );

        // Call the voice design endpoint with return_sample to get the voice for persistence
        const response = await fetch(
          "http://127.0.0.1:65000/audio/quality/persona",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: sampleText,
              persona: {
                voice_id: `companion_${companion.id}`,
                instruct: instruct,
                sample_text: sampleText,
              },
              language: "English",
              return_sample: true, // Request the voice sample to be returned for persistence
              force_redesign: true, // Force new voice design
            }),
          },
        );

        if (!response.ok) {
          throw new Error(`Voice generation failed: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.ok) {
          // Store the voice sample for persistence
          // This sample can be sent back as restore_sample to reinitialize the voice
          const voiceSample = result.voice_sample_base64
            ? `data:audio/wav;base64,${result.voice_sample_base64}`
            : null;

          // Also get the generated speech as a preview
          let previewAudio = null;
          if (result.audio_path) {
            const audioResponse = await fetch(
              `http://127.0.0.1:65000/files/${result.audio_path.split("/").pop()}`,
            );
            if (audioResponse.ok) {
              const audioBlob = await audioResponse.blob();
              const reader = new FileReader();
              previewAudio = await new Promise((resolve) => {
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(audioBlob);
              });
            }
          }

          // Store voice data with the companion
          companion.voiceSample = voiceSample || previewAudio;
          companion.voiceInstruct = instruct;
          companion.voicePreview = previewAudio;

          // Update in companions list
          const idx = companions.value.findIndex((c) => c.id === companion.id);
          if (idx >= 0) {
            companions.value[idx].voiceSample = companion.voiceSample;
            companions.value[idx].voiceInstruct = instruct;
            companions.value[idx].voicePreview = previewAudio;
            await saveCompanions();
          }

          // Update selected companion if it's the same
          if (selectedCompanion.value?.id === companion.id) {
            selectedCompanion.value = { ...companion };
          }

          console.log(
            `[Roleplay] Generated voice sample for ${companion.name}`,
          );

          // Auto-play the preview so user can hear it
          if (previewAudio) {
            playVoiceSample({ voiceSample: previewAudio });
          }
        } else {
          throw new Error(result.error || "Voice generation failed");
        }
      } catch (e) {
        console.error("[Roleplay] Failed to generate companion voice:", e);
        alert(`Failed to generate voice: ${e.message}`);
      } finally {
        isGeneratingVoice.value = false;
        generatingVoiceId.value = null;
      }
    };

    /**
     * Play a companion's voice sample
     */
    const playVoiceSample = (companion) => {
      if (!companion?.voiceSample) return;

      try {
        // Stop any currently playing audio
        if (voiceAudioElement.value) {
          voiceAudioElement.value.pause();
          voiceAudioElement.value = null;
        }

        // Create and play audio
        const audio = new Audio(companion.voiceSample);
        voiceAudioElement.value = audio;
        audio.play().catch((e) => {
          console.error("[Roleplay] Failed to play voice sample:", e);
        });
      } catch (e) {
        console.error("[Roleplay] Error playing voice sample:", e);
      }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // COMPANION & SCENARIO IMPORT/EXPORT
    // ═══════════════════════════════════════════════════════════════════════════

    const companionImportInput = ref(null);
    const scenarioImportInput = ref(null);

    /**
     * Export all companions to JSON file
     */
    const exportCompanions = () => {
      const exportData = {
        type: "bonzai-companions",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        companions: companions.value.map((c) => ({
          ...c,
          image: c.image || null,
        })),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bonzai-companions-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log(`[Roleplay] Exported ${allCompanions.length} companions`);
    };

    /**
     * Export a single companion to JSON file
     */
    const exportCompanion = (companion) => {
      const exportData = {
        type: "bonzai-companion",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        companion: {
          ...companion,
          image: companion.image || null,
        },
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `companion-${companion.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log(`[Roleplay] Exported companion: ${companion.name}`);
    };

    /**
     * Trigger companion import file dialog
     */
    const triggerCompanionImport = () => {
      companionImportInput.value?.click();
    };

    /**
     * Handle companion import from file
     */
    const handleCompanionImport = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const importedData = JSON.parse(text);

        let importedCount = 0;
        let rejectedCount = 0;

        const importCompanion = (companion) => {
          if (!companion.name) return;

          // Age validation - reject underage companions
          const ageValidation = validateCompanionAge(companion);
          if (!ageValidation.valid) {
            console.warn(
              `[Roleplay] Rejected companion "${companion.name}": ${ageValidation.reason}`,
            );
            rejectedCount++;
            return;
          }

          // Sanitize age to ensure it's at least 18
          sanitizeCompanionAge(companion);

          // Check if already exists by name
          const exists = companions.value.some(
            (c) => c.name.toLowerCase() === companion.name.toLowerCase(),
          );
          if (!exists) {
            // Generate new ID if needed
            if (!companion.id) {
              companion.id = `companion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }
            companions.value.push(companion);
            importedCount++;
          } else {
            // Update existing if it has a new image
            const idx = companions.value.findIndex(
              (c) => c.name.toLowerCase() === companion.name.toLowerCase(),
            );
            if (idx >= 0 && companion.image && !companions.value[idx].image) {
              companions.value[idx].image = companion.image;
              importedCount++;
            }
          }
        };

        if (
          importedData.type === "bonzai-companions" &&
          importedData.companions
        ) {
          // Multiple companions
          for (const companion of importedData.companions) {
            importCompanion(companion);
          }
        } else if (
          importedData.type === "bonzai-companion" &&
          importedData.companion
        ) {
          // Single companion
          importCompanion(importedData.companion);
        } else {
          alert("Invalid companion file format");
          return;
        }

        if (importedCount > 0) {
          await saveCompanions();
          let message = `Successfully imported ${importedCount} companion(s)`;
          if (rejectedCount > 0) {
            message += `\n${rejectedCount} companion(s) were rejected (underage content not allowed)`;
          }
          alert(message);
        } else if (rejectedCount > 0) {
          alert(
            `Import failed: ${rejectedCount} companion(s) were rejected (underage content not allowed)`,
          );
        } else {
          alert("No new companions imported (may already exist)");
        }
      } catch (e) {
        console.error("[Roleplay] Companion import failed:", e);
        alert("Failed to import companions: " + e.message);
      }

      // Reset input
      event.target.value = "";
    };

    /**
     * Export all scenarios to JSON file
     */
    const exportScenarios = () => {
      const exportData = {
        type: "bonzai-scenarios",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        scenarios: scenarios.value.map((s) => ({
          ...s,
          image: s.image || null,
        })),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bonzai-scenarios-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log(`[Roleplay] Exported ${scenarios.value.length} scenarios`);
    };

    /**
     * Export a single scenario to JSON file
     */
    const exportScenario = (scenario) => {
      const exportData = {
        type: "bonzai-scenario",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        scenario: {
          ...scenario,
          image: scenario.image || null,
        },
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scenario-${scenario.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log(`[Roleplay] Exported scenario: ${scenario.name}`);
    };

    /**
     * Trigger scenario import file dialog
     */
    const triggerScenarioImport = () => {
      scenarioImportInput.value?.click();
    };

    /**
     * Handle scenario import from file
     */
    const handleScenarioImport = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const importedData = JSON.parse(text);

        let importedCount = 0;

        const importScenario = (scenario) => {
          if (!scenario.name) return;

          // Check if already exists by name
          const exists = scenarios.value.some(
            (s) => s.name.toLowerCase() === scenario.name.toLowerCase(),
          );
          if (!exists) {
            // Generate new ID if needed
            if (!scenario.id) {
              scenario.id = `scenario_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }
            scenarios.value.push(scenario);
            importedCount++;
          } else {
            // Update existing if it has a new image
            const idx = scenarios.value.findIndex(
              (s) => s.name.toLowerCase() === scenario.name.toLowerCase(),
            );
            if (idx >= 0 && scenario.image && !scenarios.value[idx].image) {
              scenarios.value[idx].image = scenario.image;
              importedCount++;
            }
          }
        };

        if (
          importedData.type === "bonzai-scenarios" &&
          importedData.scenarios
        ) {
          // Multiple scenarios
          for (const scenario of importedData.scenarios) {
            importScenario(scenario);
          }
        } else if (
          importedData.type === "bonzai-scenario" &&
          importedData.scenario
        ) {
          // Single scenario
          importScenario(importedData.scenario);
        } else {
          alert("Invalid scenario file format");
          return;
        }

        if (importedCount > 0) {
          await saveScenarios();
          alert(`Successfully imported ${importedCount} scenario(s)`);
        } else {
          alert("No scenarios imported (may already exist)");
        }
      } catch (e) {
        console.error("[Roleplay] Scenario import failed:", e);
        alert("Failed to import scenarios: " + e.message);
      }

      // Reset input
      event.target.value = "";
    };

    const formatResponseMode = (mode) => {
      const modes = {
        text: "Text",
        "text+image": "Text + Image",
        "text+audio": "Text + Voice",
        "text+image+audio": "Full Multimodal",
        "text+image+video": "Text + Image + Video",
        "text+image+audio+video": "Ultimate Experience",
      };
      return modes[mode] || mode;
    };

    // Start a new chat (fresh session)
    const startNewChat = async () => {
      // Auto-disable optional media if the model isn't available
      if (!isModelAvailable("audio_quality"))
        settings.value.enableAudio = false;
      if (!isModelAvailable("video_fast")) settings.value.enableVideo = false;
      if (!isModelAvailable("vision")) settings.value.enableVision = false;

      // Check if there's an existing session with same params
      const key = currentSessionKey.value;
      if (key && savedSessions.value[key]) {
        // Show session manager to let user choose
        showSessionManager.value = true;
        return;
      }

      // Start fresh
      chatHistory.value = [];
      scenarioBackgroundImage.value = null;
      backgroundHistory.value = []; // Reset background history
      sceneState.value = {
        lastImageAt: -3,
        currentLocation: selectedScenario.value?.setting || "",
        recentEmotions: [],
        recentActions: [],
        lastOpeningPhrase: "",
      };

      phase.value = "chat";
      showSessionManager.value = false;
      suggestedResponses.value = [];

      nextTick(() => {
        chatInput.value?.focus();
        scrollToBottom();
      });

      // Initialize session with background image
      // If scenario has a pre-bundled image, use it directly; otherwise generate one
      if (
        selectedCompanion.value &&
        selectedScenario.value &&
        settings.value.enableImage
      ) {
        // Check if scenario already has a bundled/user image
        const existingScenarioImage = selectedScenario.value.image;

        if (existingScenarioImage) {
          // Use the existing scenario image as the background
          console.log("[Roleplay] Using existing scenario image as background");
          scenarioBackgroundImage.value = existingScenarioImage;
          backgroundHistory.value = [
            {
              messageIndex: 0,
              image: existingScenarioImage,
              location: selectedScenario.value?.setting || "initial",
            },
          ];
          await saveSession();
          console.log("[Roleplay] Session saved with pre-existing background");
        } else {
          // Generate a new background image
          isInitializingSession.value = true;
          typingStatus.value = "Setting the scene...";
          isTyping.value = true;

          try {
            const result = await roleplayCompanion.execution.initSession(
              {
                companion: selectedCompanion.value,
                scenario: selectedScenario.value,
                settings: {
                  contentLevel: settings.value.contentLevel,
                  responseMode: responseMode.value,
                },
              },
              {
                updateStatus: (status) => {
                  typingStatus.value = status;
                },
              },
            );

            if (result.success && result.backgroundImage) {
              scenarioBackgroundImage.value = result.backgroundImage;
              // Initialize background history with the first scene
              backgroundHistory.value = [
                {
                  messageIndex: 0,
                  image: result.backgroundImage,
                  location: selectedScenario.value?.setting || "initial",
                },
              ];
              console.log("[Roleplay] Initial background added to history");
            }

            // Update scene state from init
            if (result.sceneState) {
              sceneState.value = { ...result.sceneState };
            }

            // Save session immediately after background is generated
            // This ensures the background persists even if no messages are sent yet
            if (result.backgroundImage) {
              await saveSession();
              console.log("[Roleplay] Session saved with initial background");
            }
          } catch (e) {
            console.error("[Roleplay] Session init failed:", e);
          } finally {
            isInitializingSession.value = false;
            isTyping.value = false;
            typingStatus.value = "";
          }
        }
      }
    };

    // Force start new chat (overwrite existing)
    const forceStartNewChat = async () => {
      const key = currentSessionKey.value;
      if (key) {
        await deleteSession(key);
      }

      chatHistory.value = [];
      scenarioBackgroundImage.value = null;
      backgroundHistory.value = []; // Reset background history
      sceneState.value = {
        lastImageAt: -3,
        currentLocation: selectedScenario.value?.setting || "",
        recentEmotions: [],
        recentActions: [],
        lastOpeningPhrase: "",
      };

      phase.value = "chat";
      showSessionManager.value = false;
      suggestedResponses.value = [];

      nextTick(() => {
        chatInput.value?.focus();
        scrollToBottom();
      });

      // Initialize session with background image
      // If scenario has a pre-bundled image, use it directly; otherwise generate one
      if (
        selectedCompanion.value &&
        selectedScenario.value &&
        settings.value.enableImage
      ) {
        // Check if scenario already has a bundled/user image
        const existingScenarioImage = selectedScenario.value.image;

        if (existingScenarioImage) {
          // Use the existing scenario image as the background
          console.log(
            "[Roleplay] Using existing scenario image as background (force new)",
          );
          scenarioBackgroundImage.value = existingScenarioImage;
          backgroundHistory.value = [
            {
              messageIndex: 0,
              image: existingScenarioImage,
              location: selectedScenario.value?.setting || "initial",
            },
          ];
          await saveSession();
          console.log("[Roleplay] Session saved with pre-existing background");
        } else {
          // Generate a new background image
          isInitializingSession.value = true;
          typingStatus.value = "Setting the scene...";
          isTyping.value = true;

          try {
            const result = await roleplayCompanion.execution.initSession(
              {
                companion: selectedCompanion.value,
                scenario: selectedScenario.value,
                settings: {
                  contentLevel: settings.value.contentLevel,
                  responseMode: responseMode.value,
                },
              },
              {
                updateStatus: (status) => {
                  typingStatus.value = status;
                },
              },
            );

            if (result.success && result.backgroundImage) {
              scenarioBackgroundImage.value = result.backgroundImage;
              // Initialize background history with the first scene
              backgroundHistory.value = [
                {
                  messageIndex: 0,
                  image: result.backgroundImage,
                  location: selectedScenario.value?.setting || "initial",
                },
              ];
              console.log("[Roleplay] Initial background added to history");
            }

            if (result.sceneState) {
              sceneState.value = { ...result.sceneState };
            }

            // Save session immediately after background is generated
            if (result.backgroundImage) {
              await saveSession();
              console.log("[Roleplay] Session saved with initial background");
            }
          } catch (e) {
            console.error("[Roleplay] Session init failed:", e);
          } finally {
            isInitializingSession.value = false;
            isTyping.value = false;
            typingStatus.value = "";
          }
        }
      }
    };

    // Resume the matching session (same companion + scenario + settings)
    const resumeMatchingSession = async () => {
      const key = currentSessionKey.value;
      if (key && (await loadSession(key))) {
        phase.value = "chat";
        showSessionManager.value = false;
        suggestedResponses.value = [];
        nextTick(() => {
          chatInput.value?.focus();
          scrollToBottom();
          setTimeout(() => scrollToBottom(), 500);
        });
      }
    };

    // Open session manager
    const openSessionManager = () => {
      showSessionManager.value = true;
    };

    const closeSessionManager = () => {
      showSessionManager.value = false;
    };

    // Rebuild scene state from chat history (for continued sessions without saved state)
    const rebuildSceneState = () => {
      const assistantMessages = chatHistory.value.filter(
        (m) => m.role === "assistant",
      );
      const lastImageIdx = assistantMessages.reduce((lastIdx, msg, idx) => {
        return msg.image ? idx : lastIdx;
      }, -3);

      // Find the most recent environment state from messages (scanning backwards)
      let lastTimeOfDay = null;
      let lastLighting = null;
      let lastWeather = null;
      for (let i = assistantMessages.length - 1; i >= 0; i--) {
        const msg = assistantMessages[i];
        if (!lastTimeOfDay && msg.timeOfDay) lastTimeOfDay = msg.timeOfDay;
        if (!lastLighting && msg.lighting) lastLighting = msg.lighting;
        if (!lastWeather && msg.weather) lastWeather = msg.weather;
        // Stop once we've found all
        if (lastTimeOfDay && lastLighting && lastWeather) break;
      }

      sceneState.value = {
        lastImageAt: lastImageIdx,
        currentLocation: selectedScenario.value?.setting || "",
        recentEmotions: assistantMessages
          .slice(-3)
          .map((m) => m.emotion)
          .filter(Boolean),
        recentActions: assistantMessages
          .slice(-2)
          .map((m) => m.action)
          .filter(Boolean),
        lastOpeningPhrase:
          assistantMessages.length > 0
            ? (assistantMessages[assistantMessages.length - 1].content || "")
                .split(/\s+/)
                .slice(0, 5)
                .join(" ")
            : "",
        // Restored environment state
        timeOfDay: lastTimeOfDay,
        lighting: lastLighting,
        weather: lastWeather,
      };
    };

    const endChat = async () => {
      // Stop autonomous mode completely if active
      if (skillStore.autonomousMode) {
        skillStore.stopAutonomousMode();
      }

      // Save session before ending
      await saveSession();
      phase.value = "setup";
      chatHistory.value = [];
      suggestedResponses.value = [];
      showSessionManager.value = false;

      // Clear ALL memory (LLM + Flask server models)
      try {
        await clearAllMemory();
        console.log("[RoleplayChat] All memory cleared on chat end");
      } catch (e) {
        console.warn("[RoleplayChat] Failed to clear memory:", e);
      }
    };

    // Check if a message was added recently (for animation)
    const isNewMessage = (msg) => {
      if (!msg.timestamp) return false;
      return Date.now() - msg.timestamp < 2000; // Animate messages less than 2 seconds old
    };

    const scrollToBottom = () => {
      nextTick(() => {
        if (messagesContainer.value) {
          messagesContainer.value.scrollTop =
            messagesContainer.value.scrollHeight;
        }
      });
    };

    const getImageSrc = (image) => {
      if (!image) return "";
      if (image.startsWith("data:")) return image;
      if (image.startsWith("http")) return image;
      // Local file path - use Flask media stream endpoint
      if (image.startsWith("/")) {
        const port = window.BONZAI_SERVER_PORT || 65000;
        return `http://localhost:${port}/media/stream?path=${encodeURIComponent(image)}`;
      }
      return `data:image/png;base64,${image}`;
    };

    const getAudioSrc = (audio) => {
      if (!audio) return "";
      if (audio.startsWith("data:")) return audio;
      if (audio.startsWith("http")) return audio;
      // Local file path - use Flask media stream endpoint
      if (audio.startsWith("/")) {
        const port = window.BONZAI_SERVER_PORT || 65000;
        return `http://localhost:${port}/media/stream?path=${encodeURIComponent(audio)}`;
      }
      return `data:audio/wav;base64,${audio}`;
    };

    const getVideoSrc = (video) => {
      if (!video) return "";
      if (video.startsWith("data:")) return video;
      if (video.startsWith("http")) return video;
      // Local file path - use Flask media stream endpoint
      if (video.startsWith("/")) {
        const port = window.BONZAI_SERVER_PORT || 65000;
        return `http://localhost:${port}/media/stream?path=${encodeURIComponent(video)}`;
      }
      return video;
    };

    // Download image to user's device
    const downloadImage = async (image, idx) => {
      try {
        const imageSrc = getImageSrc(image);
        const response = await fetch(imageSrc);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${selectedCompanion.value?.name || "companion"}_${idx}_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error("[RoleplayChat] Failed to download image:", e);
      }
    };

    // Send image to GenerativeVideo for image-to-video generation
    const sendToVideoGenerator = async (image) => {
      try {
        const imageSrc = getImageSrc(image);
        // Store the image in sessionStorage for GenerativeVideo to pick up
        if (image.startsWith("data:")) {
          sessionStorage.setItem("pendingI2VImage", image);
        } else {
          // Fetch and convert to base64
          const response = await fetch(imageSrc);
          const blob = await response.blob();
          const reader = new FileReader();
          reader.onload = () => {
            sessionStorage.setItem("pendingI2VImage", reader.result);
            // Navigate to GenerativeVideo tab
            window.dispatchEvent(
              new CustomEvent("navigate-to-tab", { detail: { tab: "video" } }),
            );
          };
          reader.readAsDataURL(blob);
          return;
        }
        // Navigate to GenerativeVideo tab
        window.dispatchEvent(
          new CustomEvent("navigate-to-tab", { detail: { tab: "video" } }),
        );
      } catch (e) {
        console.error(
          "[RoleplayChat] Failed to send image to video generator:",
          e,
        );
      }
    };

    // Delete specific media type from a message (or the whole message if only text)
    const deleteMessageMedia = async (messageIdx, mediaType) => {
      const msg = chatHistory.value[messageIdx];
      if (!msg) return;

      if (mediaType === "text") {
        // If message only has text (no media), remove the entire message
        const hasMedia = msg.image || msg.audio || msg.video;
        if (!hasMedia) {
          chatHistory.value.splice(messageIdx, 1);
          console.log(
            `[RoleplayChat] Deleted entire message at index ${messageIdx}`,
          );
        } else {
          // Clear just the text content and action
          msg.content = "";
          msg.action = "";
          console.log(
            `[RoleplayChat] Cleared text from message at index ${messageIdx}`,
          );
        }
      } else if (mediaType === "image") {
        delete msg.image;
        console.log(
          `[RoleplayChat] Deleted image from message at index ${messageIdx}`,
        );
      } else if (mediaType === "audio") {
        delete msg.audio;
        console.log(
          `[RoleplayChat] Deleted audio from message at index ${messageIdx}`,
        );
      } else if (mediaType === "video") {
        delete msg.video;
        console.log(
          `[RoleplayChat] Deleted video from message at index ${messageIdx}`,
        );
      }

      // Check if message is now empty (no content and no media)
      const updatedMsg = chatHistory.value[messageIdx];
      if (
        updatedMsg &&
        !updatedMsg.content &&
        !updatedMsg.image &&
        !updatedMsg.audio &&
        !updatedMsg.video
      ) {
        chatHistory.value.splice(messageIdx, 1);
        console.log(
          `[RoleplayChat] Removed empty message at index ${messageIdx}`,
        );
      }

      // Save updated session
      await saveSession();
    };

    /**
     * Approve a purchase intent from a message
     * Records the approval and logs the intent (actual purchase execution is handled separately)
     */
    const approvePurchase = async (messageIdx) => {
      const msg = chatHistory.value[messageIdx];
      if (!msg || !msg.purchaseIntent) return;

      try {
        // Mark as approved
        msg.purchaseApproved = true;
        msg.purchaseTimestamp = Date.now();
        console.log("[Roleplay] Purchase approved:", msg.purchaseIntent.item);

        // Log to transaction history
        const transaction = {
          type: "purchase_intent_approved",
          item: msg.purchaseIntent.item,
          reason: msg.purchaseIntent.reason,
          estimatedCost: msg.purchaseIntent.estimatedCost,
          companionId: selectedCompanion.value?.id,
          companionName: selectedCompanion.value?.name,
          timestamp: Date.now(),
          status: "pending",
        };

        // Store transaction for reference
        if (!transactionHistory.value) {
          transactionHistory.value = [];
        }
        transactionHistory.value.push(transaction);

        // Execute the purchase via purchaseExecutor
        if (agentWalletAddress.value) {
          const payResult = await purchaseExecutorService.executePurchase(
            selectedCompanion.value.id,
            msg.purchaseIntent,
            settings.value.autonomous,
            selectedCompanion.value,
            { history: chatHistory.value },
          );
          msg.purchaseExecuted = payResult.success;
          msg.purchaseTxHash = payResult.txHash || null;
          msg.purchaseType = payResult.type || null;
          msg.purchaseDetails = payResult.details || null;
          msg.purchaseError = payResult.success ? null : payResult.error;
          // Refresh daily spending after payment
          dailySpentAmount.value = parseFloat(
            await x402ExecutorService.getDailySpending(
              selectedCompanion.value.id,
            ),
          );
        }

        // Update transaction status from 'pending' to result
        transaction.status = msg.purchaseExecuted ? "completed" : "failed";

        // Save session with updated state
        await saveSession();
      } catch (e) {
        console.error("[Roleplay] Failed to approve purchase:", e);
      }
    };

    /**
     * Reject a purchase intent from a message
     */
    const rejectPurchase = async (messageIdx) => {
      const msg = chatHistory.value[messageIdx];
      if (!msg || !msg.purchaseIntent) return;

      msg.purchaseRejected = true;
      msg.purchaseTimestamp = Date.now();
      console.log("[Roleplay] Purchase rejected:", msg.purchaseIntent.item);

      // Save session with updated state
      await saveSession();
    };

    /**
     * Regenerate image and/or video for a message using enhanced LLM-based prompt generation.
     * This creates more accurate visuals by analyzing the full response text.
     */
    const regenerateMedia = async (
      messageIdx,
      regenerateImage = true,
      regenerateVideo = false,
    ) => {
      const msg = chatHistory.value[messageIdx];
      if (!msg || msg.role !== "assistant") return;

      regeneratingMediaIdx.value = messageIdx;
      typingStatus.value = "Creating enhanced visual...";

      try {
        const result = await regenerateMessageMedia(
          {
            message: msg,
            companion: selectedCompanion.value,
            scenario: selectedScenario.value,
            contentLevel: settings.value.contentLevel,
            sceneState: {
              ...sceneState.value,
              userAppearance: userProfile.value.userDescription || "a man",
            },
          },
          {
            regenerateImage,
            regenerateVideo,
            onProgress: (progress) => {
              if (progress.type === "status") {
                typingStatus.value = progress.message;
              } else if (progress.type === "image") {
                chatHistory.value[messageIdx].image = progress.image;
              } else if (progress.type === "video") {
                chatHistory.value[messageIdx].video = progress.video;
              }
            },
          },
        );

        // Update message with regenerated media
        if (result.image) {
          chatHistory.value[messageIdx].image = result.image;
        }
        if (result.video) {
          chatHistory.value[messageIdx].video = result.video;
        }

        // Save session with updated media
        await saveSession();
        console.log(
          `[RoleplayChat] Regenerated media for message ${messageIdx}`,
        );
      } catch (e) {
        console.error("[RoleplayChat] Failed to regenerate media:", e);
      } finally {
        regeneratingMediaIdx.value = null;
        typingStatus.value = "";
      }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // VISION / IMAGE UPLOAD FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    const triggerImageUpload = () => {
      imageInput.value?.click();
    };

    const handleImageUpload = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        uploadedImage.value = e.target.result; // data:image/...;base64,...
        // Extract raw base64 (without data URL prefix)
        uploadedImageBase64.value = e.target.result.split(",")[1];

        // Automatically analyze the image
        await analyzeUploadedImage();
      };
      reader.readAsDataURL(file);

      // Reset input so same file can be selected again
      event.target.value = "";
    };

    /**
     * Handle user profile image upload
     */
    const handleUserImageUpload = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        userProfile.value.userImage = e.target.result; // data:image/...;base64,...
        await saveUserProfile();
        console.log("[RoleplayChat] User profile image uploaded");
      };
      reader.readAsDataURL(file);

      // Reset input so same file can be selected again
      event.target.value = "";
    };

    const analyzeUploadedImage = async () => {
      if (!uploadedImageBase64.value) return;

      isAnalyzingImage.value = true;
      imageAnalysis.value = null;

      try {
        const port = window.BONZAI_SERVER_PORT || 65000;
        const response = await fetch(
          `http://localhost:${port}/vision/analyze`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              image_base64: uploadedImageBase64.value,
              prompt: `Describe this image in detail for a roleplay companion interaction. Focus on:
              - What is shown in the image (objects, people, scenes)
              - The mood or atmosphere
              - Any notable details that could be used for conversation or storytelling
              - If there's a person, describe their appearance, expression, and what they might be doing`,
              max_tokens: 512,
              auto_download: true,
            }),
          },
        );

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.response) {
            imageAnalysis.value = data.response;
            console.log("[RoleplayChat] Vision analysis:", data.response);
          }
        } else {
          console.warn(
            "[RoleplayChat] Vision analysis failed:",
            await response.text(),
          );
        }
      } catch (e) {
        console.error("[RoleplayChat] Vision analysis error:", e);
      } finally {
        isAnalyzingImage.value = false;
      }
    };

    const clearUploadedImage = () => {
      uploadedImage.value = null;
      uploadedImageBase64.value = null;
      imageAnalysis.value = null;
    };

    // ═══════════════════════════════════════════════════════════════════════════

    // Process a single message (internal function)
    const processMessage = async (messageData) => {
      const { messageContent, visionData } = messageData;

      // Generate response
      isTyping.value = true;
      typingStatus.value = "";

      // Build settings with computed responseMode
      const executionSettings = {
        contentLevel: settings.value.contentLevel,
        responseMode: responseMode.value, // Built from checkbox options
      };

      // Add placeholder assistant message for streaming display
      const assistantMessageIndex = chatHistory.value.length;
      chatHistory.value.push({
        role: "assistant",
        content: null, // Will be filled by streaming callback
        emotion: null,
        action: null,
        image: null,
        audio: null,
        video: null,
        isGenerating: true, // Flag to show loading state
        generatingText: true,
        generatingImage: settings.value.enableImage,
        generatingAudio: settings.value.enableAudio,
        generatingVideo: settings.value.enableVideo,
      });
      scrollToBottom();

      try {
        const result = await roleplayCompanion.execution.executeMessage(
          {
            userMessage: messageContent,
            session: {
              companion: selectedCompanion.value,
              scenario: selectedScenario.value,
              history: chatHistory.value.slice(0, -1), // Exclude the placeholder
            },
            settings: executionSettings,
            sceneState: {
              ...sceneState.value,
              userAppearance: userProfile.value.userDescription || "a man",
            },
            visionData, // Pass vision analysis to LLM
          },
          {
            updateStatus: (status) => {
              typingStatus.value = status;
            },
            // Streaming callback - update message as content becomes available
            onProgress: (progress) => {
              const msg = chatHistory.value[assistantMessageIndex];
              if (!msg) return;

              // Update the message with new content
              if (progress.type === "text") {
                const responseText = cleanMessageContent(
                  progress.response?.response,
                );
                console.log(
                  `[RoleplayChat] Text progress received, content length: ${responseText?.length || 0}, preview: "${responseText?.substring(0, 50) || "EMPTY"}"`,
                );
                msg.content = responseText;
                msg.emotion = progress.response.emotion;
                msg.action = progress.response.action;
                msg.generatingText = false;
                msg.isGenerating =
                  msg.generatingImage ||
                  msg.generatingAudio ||
                  msg.generatingVideo;
                scrollToBottom();
              } else if (progress.type === "image") {
                msg.image = progress.response.image;
                msg.generatingImage = false;
                msg.isGenerating =
                  msg.generatingText ||
                  msg.generatingAudio ||
                  msg.generatingVideo;
                scrollToBottom();
              } else if (progress.type === "audio") {
                msg.audio = progress.response.audio;
                msg.generatingAudio = false;
                msg.isGenerating =
                  msg.generatingText ||
                  msg.generatingImage ||
                  msg.generatingVideo;
              } else if (progress.type === "video") {
                msg.video = progress.response.video;
                msg.generatingVideo = false;
                msg.isGenerating =
                  msg.generatingText ||
                  msg.generatingImage ||
                  msg.generatingAudio;
                scrollToBottom();
              } else if (progress.type === "background") {
                // Update scenario background image when location/environment changes
                if (progress.response.backgroundImage) {
                  scenarioBackgroundImage.value =
                    progress.response.backgroundImage;
                  // Add to background history for scroll-based switching
                  backgroundHistory.value.push({
                    messageIndex: chatHistory.value.length - 1,
                    image: progress.response.backgroundImage,
                    location: progress.response.newLocation || "unknown",
                    // Store environment state for this background
                    timeOfDay:
                      progress.response.timeOfDay ||
                      sceneState.value.timeOfDay ||
                      null,
                    lighting:
                      progress.response.lighting ||
                      sceneState.value.lighting ||
                      null,
                    weather:
                      progress.response.weather ||
                      sceneState.value.weather ||
                      null,
                  });
                  console.log(
                    "[RoleplayChat] Background image updated from location/environment change",
                  );
                }
              }
            },
          },
        );

        if (result.success) {
          // Final update - ensure all content is present and remove generating flag
          const msg = chatHistory.value[assistantMessageIndex];
          if (msg) {
            const finalContent = cleanMessageContent(result.response?.response);
            console.log(
              `[RoleplayChat] Final update, content length: ${finalContent?.length || 0}, preview: "${finalContent?.substring(0, 50) || "EMPTY"}"`,
            );
            msg.content = finalContent;
            msg.emotion = result.response.emotion;
            msg.action = result.response.action;
            msg.image = result.response.image;
            msg.audio = result.response.audio;
            msg.video = result.response.video;
            // Store environment state changes in message for session recovery
            if (result.response.timeOfDay)
              msg.timeOfDay = result.response.timeOfDay;
            if (result.response.lighting)
              msg.lighting = result.response.lighting;
            if (result.response.weather) msg.weather = result.response.weather;
            msg.isGenerating = false;
            msg.generatingText = false;
            msg.generatingImage = false;
            msg.generatingAudio = false;
            msg.generatingVideo = false;
          }

          // Update scene state from response
          if (result.sceneState) {
            sceneState.value = { ...result.sceneState };
          }

          // Update background image if a new one was generated (location change)
          if (result.response?.backgroundImage) {
            scenarioBackgroundImage.value = result.response.backgroundImage;
            // Add to background history for scroll-based switching (if not already added via progress callback)
            const existingEntry = backgroundHistory.value.find(
              (entry) => entry.image === result.response.backgroundImage,
            );
            if (!existingEntry) {
              backgroundHistory.value.push({
                messageIndex: assistantMessageIndex,
                image: result.response.backgroundImage,
                location:
                  result.response.newLocation ||
                  result.sceneState?.currentLocation ||
                  "unknown",
                // Store environment state for this background
                timeOfDay: result.sceneState?.timeOfDay || null,
                lighting: result.sceneState?.lighting || null,
                weather: result.sceneState?.weather || null,
              });
              console.log(
                "[RoleplayChat] Background added to history from result",
              );
            }
            console.log("[RoleplayChat] Background image updated from result");
          }

          // Update suggested responses
          if (result.response.suggestedResponses) {
            suggestedResponses.value = result.response.suggestedResponses;
          }

          // Handle purchase intent if detected
          if (
            result.response.purchaseIntent &&
            settings.value.autonomous.enablePurchases
          ) {
            const msg = chatHistory.value[assistantMessageIndex];
            if (msg) {
              msg.purchaseIntent = result.response.purchaseIntent;
              console.log(
                "[Roleplay] Purchase intent detected:",
                result.response.purchaseIntent.item,
              );

              // Auto-execute if the originating message was autonomous
              if (msg.isAutonomous && agentWalletAddress.value) {
                const payResult = await purchaseExecutorService.executePurchase(
                  selectedCompanion.value.id,
                  result.response.purchaseIntent,
                  settings.value.autonomous,
                  selectedCompanion.value,
                  { history: chatHistory.value },
                );
                msg.purchaseApproved = true;
                msg.purchaseExecuted = payResult.success;
                msg.purchaseTxHash = payResult.txHash || null;
                msg.purchaseType = payResult.type || null;
                msg.purchaseDetails = payResult.details || null;
                msg.purchaseError = payResult.success ? null : payResult.error;
                dailySpentAmount.value = parseFloat(
                  await x402ExecutorService.getDailySpending(
                    selectedCompanion.value.id,
                  ),
                );
              }
            }
          }

          // Log smart image decision for debugging
          if (result.meta?.imageSkipped) {
            console.log(
              `[Roleplay] Image skipped: shouldVisualize=${result.meta.shouldVisualize}`,
            );
          }

          // Trigger long-term memory summarization if due (only count user interactions, not autonomous)
          const userMsgCount = chatHistory.value.filter(
            (h) => !h.isAutonomous,
          ).length;
          const lastSummarized = sceneState.value.lastSummarizedAt || 0;
          const summarizeInterval =
            roleplayCompanion.execution.MEMORY_SUMMARIZE_INTERVAL || 20;

          if (
            userMsgCount - lastSummarized >= summarizeInterval &&
            userMsgCount >= 20
          ) {
            roleplayCompanion.execution
              .summarizeMemory(
                chatHistory.value,
                selectedCompanion.value,
                sceneState.value.memorySummary,
              )
              .then((summary) => {
                sceneState.value.memorySummary = summary;
                sceneState.value.lastSummarizedAt = userMsgCount;
                saveSession(); // Persist updated memory
                console.log(
                  "[Roleplay] Long-term memory updated:",
                  summary.substring(0, 80) + "...",
                );
              })
              .catch((err) =>
                console.warn("[Roleplay] Memory summarization failed:", err),
              );
          }
        } else {
          // Remove placeholder on failure
          chatHistory.value.splice(assistantMessageIndex, 1);
        }
      } catch (e) {
        console.error("[Roleplay] Message failed:", e);
        // Update the placeholder with error message
        const msg = chatHistory.value[assistantMessageIndex];
        if (msg) {
          msg.content = `*${selectedCompanion.value?.name} seems distracted for a moment* I'm sorry, could you repeat that?`;
          msg.emotion = "Confused";
          msg.isGenerating = false;
          msg.generatingText = false;
          msg.generatingImage = false;
          msg.generatingAudio = false;
          msg.generatingVideo = false;
        }
      } finally {
        isTyping.value = false;
        typingStatus.value = "";
        scrollToBottom();

        // Auto-save session after each message
        await saveSession();

        // Sync with store if autonomous mode is active
        syncHistoryWithStore();
      }
    };

    // Process the message queue
    const processMessageQueue = async () => {
      if (isProcessingMessage.value) return;

      while (pendingMessage.value) {
        isProcessingMessage.value = true;
        const messageToProcess = pendingMessage.value;
        pendingMessage.value = null; // Clear the pending message

        await processMessage(messageToProcess);

        isProcessingMessage.value = false;
      }

      // Focus input after all messages processed
      nextTick(() => {
        chatInput.value?.focus();
      });
    };

    const sendMessage = async (message = null) => {
      // Block messages until scene setup is complete
      if (isInitializingSession.value) {
        console.log("[Roleplay] Cannot send message - scene setup in progress");
        return;
      }

      const msg = message || userMessage.value.trim();
      const hasImage = !!uploadedImage.value;

      // Need either text or image
      if (!msg && !hasImage) return;

      // Capture image data before clearing
      const visionData = hasImage
        ? {
            imageBase64: uploadedImageBase64.value,
            imageAnalysis: imageAnalysis.value,
            imageDataUrl: uploadedImage.value,
          }
        : null;

      // Build user message content
      const messageContent = msg || (hasImage ? "*shares an image*" : "");

      // Add user message to chat immediately (include image if present)
      chatHistory.value.push({
        role: "user",
        content: messageContent,
        image: visionData?.imageDataUrl || null, // Show uploaded image in chat
      });
      userMessage.value = "";
      suggestedResponses.value = [];
      clearUploadedImage(); // Clear after capturing
      scrollToBottom();

      // Create message data object
      const messageData = { messageContent, visionData };

      // If currently processing, queue this message (replaces any existing pending)
      if (isProcessingMessage.value) {
        console.log(
          "[Roleplay] Message queued while generating:",
          messageContent.substring(0, 50),
        );
        pendingMessage.value = messageData;
        return;
      }

      // Process immediately
      pendingMessage.value = messageData;
      await processMessageQueue();
    };

    // Load sessions, companions, scenarios, and check model availability on mount
    onMounted(async () => {
      await Promise.all([
        loadSessions(),
        loadCompanions(),
        loadScenarios(),
        checkModelAvailability(),
      ]);

      // Load global user profile (after sessions so migration can work)
      await loadUserProfile();

      // Load NFT companions after local companions are ready
      await loadNFTCompanions();

      // Render spending charts after companions are loaded
      setTimeout(() => {
        renderSpendingCharts();
      }, 100);

      // Set up socket listener for download completion events
      setupDownloadsSocket();

      // Check if there's an active autonomous session for this companion
      // If so, restore to chat phase and sync history
      const storeData = skillStore.getAutonomousSessionData();
      console.log("[Roleplay] Checking for autonomous session:", {
        sessionKey: storeData.sessionKey,
        autonomousMode: skillStore.autonomousMode,
        historyLength: storeData.history?.length || 0,
        missedMessages: skillStore.missedMessages,
      });

      if (storeData.sessionKey && skillStore.autonomousMode) {
        // Parse session key to find companion/scenario
        const parts = storeData.sessionKey.split("__");
        if (parts.length >= 4) {
          const [companionId, scenarioId, contentLevel, respMode] = parts;
          console.log(
            "[Roleplay] Looking for companion with ID:",
            companionId,
            "scenario:",
            scenarioId,
          );

          // Find matching companion
          let companion = companions.value.find((c) => c.id === companionId);
          let companionSource = companion ? "companions" : null;

          if (!companion) {
            // Fallback: Try getting companion directly from the store session
            const storeCompanion = skillStore.autonomousSession?.companion;
            if (storeCompanion) {
              const storeCompanionId =
                storeCompanion.id ||
                `companion_${storeCompanion.name?.toLowerCase().replace(/\s+/g, "_")}`;
              if (
                storeCompanionId === companionId ||
                storeCompanion.id === companionId
              ) {
                companion = storeCompanion;
                companionSource = "storeSession";
              }
            }
          }

          if (!companion) {
            // Last resort: Check savedSessions for this exact session key
            const savedSession = savedSessions.value[storeData.sessionKey];
            if (savedSession?.companion) {
              companion = savedSession.companion;
              companionSource = "savedSession";
            }
          }

          // Find matching scenario
          let scenario = scenarios.value.find((s) => s.id === scenarioId);
          if (!scenario) {
            // Try store session
            scenario =
              skillStore.autonomousSession?.scenario?.id === scenarioId
                ? skillStore.autonomousSession.scenario
                : null;
          }
          if (!scenario) {
            // Try savedSessions
            const savedSession = savedSessions.value[storeData.sessionKey];
            scenario = savedSession?.scenario || {
              id: scenarioId,
              name: scenarioId,
            };
          }

          console.log(
            "[Roleplay] Found companion:",
            companion?.name,
            `(source: ${companionSource})`,
            "scenario:",
            scenario?.name,
          );

          if (companion && scenario) {
            console.log(
              `[Roleplay] Restoring autonomous session: ${companion.name} in ${scenario.name} with ${storeData.history.length} messages`,
            );
            selectedCompanion.value = companion;
            selectedScenario.value = scenario;
            settings.value.contentLevel = contentLevel;

            // Parse responseMode
            settings.value.enableImage = respMode.includes("image");
            settings.value.enableAudio = respMode.includes("audio");
            settings.value.enableVideo = respMode.includes("video");
            settings.value.enableVision = respMode.includes("vision");

            // User profile is loaded globally — no per-session restore needed

            // Sync history and scene state
            chatHistory.value = [...storeData.history];
            sceneState.value = { ...storeData.sceneState };

            // Enter chat phase
            phase.value = "chat";

            // Clear missed messages since we're viewing them now
            skillStore.clearMissedMessages();

            // Scroll to see new messages
            nextTick(() => {
              scrollToBottom();
              setTimeout(() => scrollToBottom(), 500);
            });
          } else {
            console.warn(
              "[Roleplay] Could not find companion or scenario for session key:",
              storeData.sessionKey,
            );
          }
        }
      }
    });

    // Cleanup on unmount - DO NOT stop autonomous mode, let it continue
    onUnmounted(() => {
      // Disconnect downloads socket
      disconnectDownloadsSocket();

      // Always save the current session before cleanup
      // This captures any in-flight changes (background updates, partial messages, etc.)
      if (phase.value === "chat") {
        saveSession();
      }

      // Just sync the current state to store if autonomous mode is active
      if (skillStore.autonomousMode && phase.value === "chat") {
        skillStore.syncAutonomousHistory(
          chatHistory.value,
          sceneState.value,
          scenarioBackgroundImage.value,
          backgroundHistory.value,
        );
        // Autonomous mode continues running - companion keeps generating messages
      } else {
        // Clear ALL memory when leaving the skill (if not in autonomous mode)
        clearAllMemory()
          .then(() =>
            console.log("[RoleplayChat] All memory cleared on unmount"),
          )
          .catch(() => {});
      }
    });

    // Get session info for a companion (aggregated across all scenarios/settings)
    const getSessionInfo = (companion) => {
      if (!companion) return null;
      const companionId =
        companion.id ||
        `custom_${companion.name?.toLowerCase().replace(/\s+/g, "_")}`;

      // Find all sessions for this companion
      const sessions = Object.entries(savedSessions.value)
        .filter(([key]) => key.startsWith(companionId + "__"))
        .map(([, session]) => session);

      if (sessions.length === 0) return null;

      // Aggregate info
      const totalMessages = sessions.reduce(
        (sum, s) => sum + (s.history?.length || 0),
        0,
      );
      const latestUpdate = Math.max(...sessions.map((s) => s.updatedAt || 0));

      return {
        sessionCount: sessions.length,
        messageCount: totalMessages,
        updatedAt: latestUpdate,
      };
    };

    // Watch for phase changes to re-render spending charts
    watch(phase, (newPhase) => {
      if (newPhase === "setup") {
        setTimeout(() => {
          renderSpendingCharts();
        }, 100);
      }
    });

    // Watch wallet connect/disconnect to load/remove NFT companions
    watch(walletAddress, async (newAddr, oldAddr) => {
      if (newAddr && newAddr !== oldAddr) {
        await loadNFTCompanions();
      } else if (!newAddr && oldAddr) {
        // Wallet disconnected — remove NFT companions
        companions.value = companions.value.filter((c) => !c.isNFT);
      }
    });

    return {
      // Access control
      hasAccess,
      isConnected,
      connectWallet,
      skillContentIcons,
      openUnlockModal,
      // Phase & state
      phase,
      selectedCompanion,
      selectedScenario,
      showCustomCompanion,
      showCustomScenario,
      customCompanionPrompt,
      customCompanionStyle,
      customCompanionGender,
      customScenarioPrompt,
      customScenarioMood,
      customCompanion,
      customScenario,
      isGenerating,
      settings,
      chatHistory,
      userMessage,
      isTyping,
      typingStatus,
      isProcessingMessage,
      pendingMessage,
      suggestedResponses,
      messagesContainer,
      chatInput,
      showAppearanceEditor,
      companions,
      isLoadingNFTCompanions,
      scenarios,
      contentLevels,
      canStart,
      // Scene state for smart image generation
      sceneState,
      rebuildSceneState,
      // Global user profile
      userProfile,
      saveUserProfile,
      // Session persistence
      savedSessions,
      showSessionManager,
      currentSessionKey,
      matchingSession,
      companionSessions,
      formatSessionDate,
      parseSessionKey,
      loadSession,
      deleteSession,
      saveSession,
      resumeSession,
      startNewChat,
      forceStartNewChat,
      resumeMatchingSession,
      openSessionManager,
      closeSessionManager,
      getSessionInfo,
      // Companion operations
      saveCustomCompanionToStore,
      deleteCompanion,
      isCompanionAlreadySaved,
      // Scenario operations
      saveCustomScenarioToStore,
      deleteScenario,
      isScenarioAlreadySaved,
      // Import/Export companions and scenarios
      companionImportInput,
      scenarioImportInput,
      exportCompanions,
      exportCompanion,
      triggerCompanionImport,
      handleCompanionImport,
      exportScenarios,
      exportScenario,
      triggerScenarioImport,
      handleScenarioImport,
      // Import/Export sessions
      importInput,
      triggerImportSession,
      handleImportSession,
      exportSession,
      exportAllSessions,
      // Scenario background
      scenarioBackgroundImage,
      scenarioBackgroundStyle,
      backgroundHistory,
      onMessagesScroll,
      isInitializingSession,
      // Autonomous companion mode (uses global skillStore)
      autonomousMode,
      autonomousModeDisplay,
      autonomousPending,
      missedMessages,
      toggleAutonomousMode,
      clearMissedMessages,
      // Fullscreen mode
      isFullscreen,
      roleplayChatRef,
      toggleFullscreen,
      // Moltbook integration
      moltbookApiKey,
      moltbookUsername,
      moltbookBio,
      isSavingMoltbook,
      isRegisteringMoltbook,
      isCustomCompanion,
      companionMoltbookRegistered,
      companionMoltbookUrl,
      registerMoltbookAccount,
      saveMoltbookCredentials,
      refreshMoltbookProfile,
      disconnectMoltbook,
      loadMoltbookCredentials,
      // Social platforms
      socialPlatforms,
      socialConnected,
      isConnectingSocial,
      socialPostHistory,
      showMoltbookKeyInput,
      anyPlatformConnected,
      connectSocialPlatform,
      disconnectSocialPlatform,
      refreshSocialConnections,
      toggleContentMix,
      // NFT minting
      isMintingNFT,
      mintingCompanionId,
      mintResult,
      mintNetwork,
      mintCompanionNFT,
      deployUPForCompanion,
      deployingUPForCompanionId,
      openExternal,
      // Companion Token Launch
      isLaunchingToken,
      launchingTokenCompanionId,
      tokenLaunchEthAmounts,
      tokenLaunchResult,
      launchCompanionToken,
      getUniswapTradeUrl,
      getBaseScanUrl,
      // Minted badge helpers
      getMintedBadgeClass,
      getMintedBadgeText,
      getMintedBadgeTitle,
      getMintedExplorerUrl,
      // x402 Agent Wallet
      agentWalletAddress,
      agentWalletBalance,
      isRefreshingBalance,
      showTransactionHistory,
      transactionHistory,
      dailySpentAmount,
      dailySpendingPercentage,
      copyWalletAddress,
      truncateAddress,
      refreshAgentWalletBalance,
      loadAgentWallet,
      loadTransactionHistory,
      logTransaction,
      canMakePurchase,
      executeX402Payment,
      approvePurchase,
      rejectPurchase,
      // Seller registry
      showSellerRegistry,
      registrySellers,
      newCustomSeller,
      loadSellerRegistry,
      toggleSellerEnabled,
      addCustomSellerEntry,
      removeCustomSeller,
      formatPurchaseResult,
      // Voice generation
      isGeneratingVoice,
      generatingVoiceId,
      generateCompanionVoice,
      playVoiceSample,
      // Methods
      getAvatarIcon,
      selectCompanion,
      selectScenario,
      openCustomCompanion,
      openCustomScenario,
      generateCustomCompanion,
      useCustomCompanion,
      generateCustomScenario,
      useCustomScenario,
      cancelCustomCompanion,
      cancelCustomScenario,
      generationError,
      generationCancelled,
      // Keyword cycling animation
      keywordIndices,
      getCurrentKeyword,
      registerKeywordCard,
      parseKeywords,
      // Image regeneration
      isRegeneratingImage,
      regeneratingId,
      regenerateCompanionImage,
      regenerateScenarioImage,
      regenerateSpendingProfile,
      // Spending profile charts
      spendingChartRefs,
      formatResponseMode,
      endChat,
      getImageSrc,
      getAudioSrc,
      getVideoSrc,
      sendMessage,
      isNewMessage,
      downloadImage,
      sendToVideoGenerator,
      deleteMessageMedia,
      regenerateMedia,
      regeneratingMediaIdx,
      // Vision/Image upload
      imageInput,
      uploadedImage,
      imageAnalysis,
      isAnalyzingImage,
      triggerImageUpload,
      handleImageUpload,
      handleUserImageUpload,
      clearUploadedImage,
      // Model availability
      modelAvailability,
      modelAvailabilityChecked,
      isModelAvailable,
      toggleMediaOption,
      canStartChat,
      requiredLLMName,
      requiredModelsForSelection,
      mandatoryModels,
      missingMandatory,
      missingOptional,
      missingModels,
      satisfiedModels,
      getModelInfo,
      responseMode,
      downloadMissingOptional,
      // Download functionality
      isDownloadingPipeline,
      downloadingPipelineKey,
      downloadProgress,
      downloadPipeline,
    };
  },
};
</script>

<style scoped>
.roleplay-chat {
  width: 100%;
}

/* Fullscreen mode */
.roleplay-chat.is-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
  background: #1a1a2e;
  overflow: hidden;
  padding: 1rem;
}

.roleplay-chat.is-fullscreen .chat-phase {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.roleplay-chat.is-fullscreen .chat-header {
  flex-shrink: 0;
}

.roleplay-chat.is-fullscreen .chat-messages-container {
  flex: 1;
  height: calc(100vh - 200px);
  min-height: 0;
}

.roleplay-chat.is-fullscreen .chat-messages {
  height: 100%;
}

.roleplay-chat.is-fullscreen .chat-input-container {
  flex-shrink: 0;
  margin-top: auto;
}

/* Section Header with Import/Export buttons */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.section-header h3 {
  margin-bottom: 0;
}

.import-export-buttons {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.import-export-buttons .button {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.import-export-buttons .button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Autonomous Mode Section */
.moltbook-settings-panel {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 0.75rem 1rem;
}

.moltbook-status {
  display: flex;
  align-items: center;
}

.moltbook-options .checkbox {
  color: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
}

.moltbook-options .checkbox input[type="checkbox"] {
  margin-right: 0.5rem;
}

.moltbook-activity-log {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 0.5rem;
  max-height: 120px;
  overflow-y: auto;
}

.moltbook-activity-item {
  color: rgba(255, 255, 255, 0.7);
  padding: 0.2rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.moltbook-activity-item:last-child {
  border-bottom: none;
}

.moltbook-register {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 0.75rem 1rem;
}

.moltbook-tabs {
  display: flex;
  gap: 0;
}

.moltbook-tabs .button {
  border-radius: 4px;
  transition: all 0.2s;
}

.moltbook-tabs .button:not(.is-info) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.7);
}

.moltbook-tabs .button:not(.is-info):hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

/* Spin animation for refresh button */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Mint Guide */
.mint-guide {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.03) 0%,
    rgba(255, 255, 255, 0.06) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px 20px;
}

.mint-guide-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.mint-guide-step {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.mint-guide-step div {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.mint-guide-step strong {
  font-size: 0.85rem;
}

.mint-guide-step span.has-text-grey-light {
  font-size: 0.72rem;
  max-width: 160px;
}

.mint-guide-icon {
  font-size: 24px !important;
  flex-shrink: 0;
}

.mint-guide-arrow {
  font-size: 18px !important;
  flex-shrink: 0;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
}

/* Setup Phase */
.companion-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  justify-content: start;
}

.scenario-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2rem;
  justify-content: start;
}

.companion-card,
.scenario-card {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.companion-card:hover,
.scenario-card:hover {
  background: rgba(97, 55, 142, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
}

.companion-card.is-selected,
.scenario-card.is-selected {
  border-color: rgba(255, 255, 255, 1);
  background: rgba(97, 55, 142, 0.33);
  backdrop-filter: blur(64px);
}

.companion-card.is-custom,
.scenario-card.is-custom {
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.3);
}

/* Card action buttons (top left/right) */
.card-action-btn {
  position: absolute;
  background: rgba(50, 115, 220, 0.9);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  color: #fff;
  z-index: 5;
}

.card-action-btn.top-left {
  top: -14px;
  left: 14px;
}

.card-action-btn.top-left-second {
  top: -14px;
  right: 14px;
  background: rgba(255, 56, 96, 0.9);
}

.companion-card:hover .card-action-btn,
.scenario-card:hover .card-action-btn {
  opacity: 1;
}

.card-action-btn:hover {
  opacity: 1;
  transform: scale(1.1);
}

.card-action-btn.top-left-second:hover {
  background: rgba(255, 56, 96, 1);
}

/* Gender icon prefix */
.gender-icon {
  font-size: 20px;
  vertical-align: middle;
  margin-right: 4px;
  opacity: 0.8;
}

/* Portrait container */
.companion-portrait-container {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  margin: 0.75rem 0;
  border-radius: 2px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
}

.companion-portrait {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.companion-portrait-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
}

.companion-portrait-placeholder .material-symbols-outlined {
  font-size: 64px;
  color: rgba(255, 255, 255, 0.2);
}

/* Regenerate portrait button */
.regenerate-portrait-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(138, 43, 226, 0.9);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  color: #fff;
}

.regenerate-portrait-btn:hover {
  transform: scale(1.1);
}

.companion-portrait-container:hover .regenerate-portrait-btn {
  opacity: 1;
}

.regenerate-portrait-btn:hover {
  background: rgba(138, 43, 226, 1);
}

/* NFT badge on companion card */
.nft-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
}

.nft-badge .tag {
  backdrop-filter: blur(8px);
  font-size: 10px;
  gap: 3px;
  padding: 2px 8px;
  height: auto;
}

/* Voice generation button */
.regenerate-voice-btn {
  position: absolute;
  bottom: 8px;
  right: 42px;
  background: rgba(138, 43, 226, 0.9);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  color: #fff;
}

.regenerate-voice-btn:hover {
  transform: scale(1.1);
  background: rgba(138, 43, 226, 1);
}

.companion-portrait-container:hover .regenerate-voice-btn {
  opacity: 1;
}

/* Voice sample indicator */
.voice-indicator {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(138, 43, 226, 0.9);
  border: none;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  z-index: 4;
}

.voice-indicator:hover {
  transform: scale(1.1);
  background: rgba(138, 43, 226, 1);
}

.session-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(57, 213, 130, 0.8);
  color: #fff;
  font-size: 10px;
  font-weight: bold;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  z-index: 4;
}

/* Custom badge for saved companions */
.custom-badge {
  position: absolute;
  top: 8px;
  right: 36px;
  background: rgba(50, 115, 220, 0.9);
  color: #fff;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4;
}

.companion-card {
  /* border-color: rgba(57, 213, 130, 0.5) !important; */
  box-shadow: 0 8px 12px rgba(0, 0, 0, 0.33);
}

/* Saved custom companions */
.companion-card.is-saved-custom {
  position: relative;
  border-color: rgba(255, 255, 255, 0.3);
  border-style: dashed;
}

.companion-card.is-saved-custom:hover {
  border-color: rgba(50, 115, 220, 0.7);
}

/* Export button for companion cards (legacy - kept for compatibility) */
.export-custom-btn {
  position: absolute;
  top: -24px;
  left: -24px;
  background: rgba(50, 115, 220, 0.9);
  border: none;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  color: #fff;
  padding: 0;
}

.companion-card.is-saved-custom:hover .export-custom-btn {
  opacity: 1;
}

.export-custom-btn:hover {
  background: rgba(50, 115, 220, 1);
}

/* User Profile Section */
.user-profile-section {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 1rem;
}

.user-profile-section h4 {
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.user-profile-card {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 1rem;
  align-items: start;
}

.user-portrait-container {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  border: 2px dashed rgba(255, 255, 255, 0.2);
  cursor: pointer;
  transition: border-color 0.2s;
}

.user-portrait-container:hover {
  border-color: rgba(138, 43, 226, 0.6);
}

.user-portrait {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-portrait-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  color: rgba(255, 255, 255, 0.4);
}

.user-portrait-placeholder .material-symbols-outlined {
  font-size: 32px;
}

.user-portrait-placeholder span:last-child {
  font-size: 0.7rem;
}

.clear-image-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(255, 56, 96, 0.9);
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  opacity: 0;
  transition: opacity 0.2s;
}

.user-portrait-container:hover .clear-image-btn {
  opacity: 1;
}

.clear-image-btn:hover {
  background: rgba(255, 56, 96, 1);
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.user-info .field .label {
  font-size: 0.75rem;
  margin-bottom: 0.25rem;
}

.user-info .field .input,
.user-info .field .textarea {
  font-size: 0.85rem;
}

.user-info .field .textarea {
  min-height: 70px;
  resize: vertical;
}

/* Spending Management Section */
.spending-management-section {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 12px;
  padding: 1.5rem;
}

/* Wallet Card */
.wallet-card {
  background: linear-gradient(
    135deg,
    rgba(50, 115, 220, 0.2),
    rgba(138, 43, 226, 0.1)
  );
  border: 1px solid rgba(50, 115, 220, 0.3);
  border-radius: 8px;
}

.wallet-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: #fff;
}

.wallet-header .material-symbols-outlined {
  font-size: 20px;
  color: #3273dc;
}

.wallet-address {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.wallet-address .address-label {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.5);
  min-width: 50px;
}

.wallet-address .address-value {
  font-family: monospace;
  font-size: 0.85rem;
  color: #3273dc;
}

.wallet-balance {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.wallet-balance .balance-label {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.5);
  min-width: 50px;
}

.wallet-balance .balance-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #39d582;
}

.wallet-balance .balance-value.is-low {
  color: #ffdd57;
}

/* Spending Stats */
.spending-stats-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: #fff;
}

.spending-stats-header .material-symbols-outlined {
  font-size: 18px;
  color: #8a2be2;
}

.spending-progress {
  margin-bottom: 0.5rem;
}

.progress-bar-container {
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #39d582, #8a2be2);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-bar-fill.is-warning {
  background: linear-gradient(90deg, #ffdd57, #ff9800);
}

.progress-bar-fill.is-danger {
  background: linear-gradient(90deg, #ff9800, #ff3860);
}

.spending-amounts {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  font-size: 0.85rem;
}

.spent-amount {
  font-weight: 600;
  color: #fff;
}

.limit-amount {
  color: rgba(255, 255, 255, 0.5);
}

/* Spending Limits */
.spending-limits-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: #fff;
}

.spending-limits-header .material-symbols-outlined {
  font-size: 18px;
  color: #8a2be2;
}

/* Transaction History Preview */
.tx-history-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: #fff;
}

.tx-history-header .material-symbols-outlined {
  font-size: 18px;
  color: #8a2be2;
}

.tx-history-header .button {
  margin-left: auto;
  font-size: 0.7rem;
}

.tx-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tx-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  font-size: 0.8rem;
}

.tx-type {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: rgba(138, 43, 226, 0.3);
  border-radius: 50%;
  color: #8a2be2;
}

.tx-details {
  flex: 1;
  color: rgba(255, 255, 255, 0.8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-amount {
  color: #39d582;
  font-weight: 500;
}

/* Rotating animation for refresh buttons */
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

/* Scenario delete and export buttons */
.delete-scenario-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(255, 56, 96, 0.9);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  color: #fff;
  z-index: 5;
}

.scenario-card.is-saved-custom:hover .delete-scenario-btn {
  opacity: 1;
}

.delete-scenario-btn:hover {
  background: rgba(255, 56, 96, 1);
}

/* Export single button for companion/scenario cards */
.export-single-btn {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(50, 115, 220, 0.9);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  color: #fff;
  z-index: 5;
}

.scenario-card:hover .export-single-btn,
.companion-card.is-saved-custom:hover .export-single-btn {
  opacity: 1;
}

.export-single-btn:hover {
  background: rgba(50, 115, 220, 1);
}

/* Export button for predefined companion cards */
.export-predefined-btn {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background: rgba(50, 115, 220, 0.9);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  color: #fff;
  z-index: 5;
}

.companion-card:hover .export-predefined-btn {
  opacity: 1;
}

.export-predefined-btn:hover {
  background: rgba(50, 115, 220, 1);
}

/* Saved Sessions List */
.saved-sessions-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.saved-session-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 8px;
  padding: 0.75rem 0;
  transition: all 0.2s;
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

.saved-session-card .session-info {
  flex: 1;
}

.saved-session-card .session-header {
  display: flex;
  align-items: center;
  margin-bottom: 0.25rem;
}

.saved-session-card .session-meta {
  margin: 0;
}

.saved-session-card .session-actions {
  display: flex;
  gap: 0.5rem;
}

/* Session Manager Modal */
.session-manager-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.session-manager-modal {
  background: #1a1a2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 0;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

.session-manager-modal .modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.session-manager-modal .modal-header h3 {
  display: flex;
  align-items: center;
  margin: 0;
}

.session-manager-modal .modal-body {
  padding: 1.5rem;
  text-align: center;
}

.companion-name,
.scenario-name {
  color: #fff;
  margin-bottom: 0.25rem;
}

.companion-name .family-name {
  color: rgba(255, 255, 255, 0.6);
  font-weight: 400;
  margin-left: 0.25rem;
}

.companion-desc,
.scenario-desc {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.85rem;
  line-height: 1.4;
}

/* Spending Profile Spider Chart */
.spending-chart-container {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0.75rem;
  margin-top: 0.5rem;
}

.spending-chart-container canvas {
  width: 100%;
  max-width: 320px;
  height: auto;
  aspect-ratio: 1;
}

.custom-companion-form,
.custom-scenario-form {
  background: rgba(0, 0, 0, 0.4);
  border-radius: 8px;
}

.custom-companion-preview,
.custom-scenario-preview {
  /* background: rgba(97, 55, 142, 0.2); */
  background: linear-gradient(
    135deg,
    rgba(155, 109, 200, 0.2),
    rgba(255, 153, 51, 0.2)
  );
  border-radius: 8px;
  border: 1px solid rgba(97, 55, 142, 0.6);
  overflow: hidden;
}

/* Generation status */
.generation-status {
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

/* Skeleton loading animations */
.skeleton-text {
  display: inline-block;
  background: linear-gradient(
    90deg,
    rgba(97, 55, 142, 0.3) 25%,
    rgba(97, 55, 142, 0.5) 50%,
    rgba(97, 55, 142, 0.3) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
  border-radius: 4px;
}

.skeleton-lines {
  display: flex;
  flex-direction: column;
}

.skeleton-pulse {
  animation: skeleton-pulse 1.5s infinite;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.8;
  }
}

/* Companion/Scenario Images */
.companion-avatar.has-image {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  overflow: hidden;
}

.companion-portrait {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 1px !important;
  border: 4px solid #fff;
  border-width: 8px 8px 48px;
}

.regenerate-image-btn {
  position: absolute;
  bottom: -8px;
  right: -8px;
  background: rgba(97, 55, 142, 0.9);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  color: white;
}

.companion-card:hover .regenerate-image-btn,
.scenario-card:hover .regenerate-image-btn {
  opacity: 1;
}

.regenerate-image-btn:hover {
  background: rgba(138, 87, 197, 1);
}

.regenerate-image-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* Scenario card with image */
.scenario-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.scenario-image {
  height: 120px;
  background-size: cover;
  background-position: center;
  position: relative;
}

.scenario-image .regenerate-image-btn.scenario-regen {
  position: absolute;
  top: 8px;
  right: 8px;
  bottom: auto;
  opacity: 0;
}

.scenario-card:hover .scenario-regen {
  opacity: 1;
}

.scenario-no-image {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  position: relative;
}

.scenario-content {
  padding: 1rem;
  flex: 1;
}

.scenario-mood {
  margin-top: 0.5rem;
  opacity: 0.7;
}

/* Custom companion preview portrait */
.custom-preview-portrait {
  width: 150px;
  height: 150px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.companion-preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-portrait {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Custom scenario preview image */
.custom-preview-image {
  width: 100%;
  height: 200px;
  overflow: hidden;
}

.custom-preview-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Keyword Cycling Animation */
.keyword-cycler {
  height: 48px;
  overflow: hidden;
  margin-top: 0.5rem;
}

.keyword-item {
  display: inline-block;
  text-transform: uppercase;
  font-size: 0.65rem;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
  letter-spacing: 0.5px;
}

.keyword-fade-enter-active {
  transition:
    opacity 0.5s ease,
    transform 0.5s ease;
}

.keyword-fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.keyword-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.keyword-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.keyword-fade-enter-to,
.keyword-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.content-level-selector {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.content-level-option {
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.3);
  padding: 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.2s;
}

.content-level-option:hover {
  background: rgba(97, 55, 142, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
}

.content-level-option.is-selected {
  border-color: rgba(255, 255, 255, 1);
  background: rgba(97, 55, 142, 0.33);
  backdrop-filter: blur(64px);
}

.content-level-icon {
  font-size: 24px;
  margin-right: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  transition: color 0.2s;
}

.content-level-option.is-selected .content-level-icon {
  color: #fff;
}

.content-level-text {
  flex: 1;
}

.content-level-option strong {
  color: #fff;
}

.content-level-option p {
  color: rgba(255, 255, 255, 0.6);
  margin-top: 0.25rem;
}

/* Chat Phase */
.chat-header {
  position: sticky;
  top: 0;
  z-index: 10;
}

.companion-header {
  display: flex;
  align-items: center;
}

.companion-header .material-symbols-outlined {
  font-size: 32px;
  color: rgba(167, 139, 250, 1);
}

.chat-phase {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 180px);
  min-height: 400px;
}

/* Container for chat messages with background */
.chat-messages-container {
  flex: 1;
  position: relative;
  margin-bottom: 1rem;
  border-radius: 8px;
  overflow: hidden;
  min-height: 0; /* Allow flex child to shrink */
}

.chat-messages {
  position: relative;
  z-index: 1;
  height: 100%;
  overflow-y: auto;
  padding: 1rem;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

/* Empty chat prompt - centered pulsating message */
.empty-chat-prompt {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.empty-chat-content {
  text-align: center;
  padding: 2rem;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 16px;
  backdrop-filter: blur(4px);
}

.empty-chat-content .pulsing-icon {
  font-size: 64px;
  color: hsl(171, 100%, 41%);
  animation: pulse-glow 2s ease-in-out infinite;
}

.empty-chat-content .pulsing-text {
  font-size: 1.25rem;
  color: #fff;
  margin-top: 1rem;
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 700;
  font-style: italic;
  animation: pulse-opacity 2s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%,
  100% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

@keyframes pulse-opacity {
  0%,
  100% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
}

/* Background layer for fade transitions */
.chat-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 8px;
  z-index: 0;
  pointer-events: none;
}

/* Background fade transition */
.bg-fade-enter-active {
  transition: opacity 0.8s ease-in;
}

.bg-fade-leave-active {
  transition: opacity 0.3s ease-out;
}

.bg-fade-enter-from {
  opacity: 0;
}

.bg-fade-leave-to {
  opacity: 0;
}

/* Ensure chat content appears above background */
.chat-messages .chat-message {
  position: relative;
  z-index: 1;
}

.scene-description .notification {
  background: rgba(50, 115, 220, 0.75);
  border: none;
  border-radius: 8px;
}

.scene-description .scene-backdrop {
  min-height: 150px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  transition: background-image 0.5s ease;
  position: relative;
  overflow: hidden;
}

.scene-description .scene-overlay {
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
  padding: 2rem 1.5rem 1.5rem;
  width: 100%;
  text-align: center;
}

.scene-description .scene-overlay p {
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  font-size: 1.1rem;
  line-height: 1.6;
}

.chat-message {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

/* Only animate newly added messages */
.chat-message.is-new {
  animation: messageSlideIn 0.4s ease-out;
}

@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.chat-message.user {
  flex-direction: row-reverse;
}

.chat-message.user .message-content {
  align-items: flex-end;
}

.chat-message.user .message-text {
  background: rgba(97, 55, 142, 0.5);
  backdrop-filter: blur(32px);
}

.message-avatar {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.message-avatar.has-image {
  background: transparent;
}

.message-avatar .avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.message-avatar .material-symbols-outlined {
  font-size: 24px;
  color: #fff;
}

.message-content {
  display: flex;
  flex-direction: column;
  max-width: 50%;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  border-radius: 12px;
}

.message-sender {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
}

.message-text {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.75rem 1rem;
  border-radius: 12px;
  color: #fff;
  backdrop-filter: blur(32px);
}

.action-text {
  margin-bottom: 2em !important;
  font-size: 0.8rem;
  opacity: 0.5;
  text-align: left;
}

.message-image {
  width: 100%;
  max-width: 100%;
  border-radius: 8px;
  overflow: hidden;
  animation: mediaFadeIn 0.5s ease-out forwards;
  opacity: 0;
  position: relative;
}

.message-image .image-actions {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.message-image:hover .image-actions {
  opacity: 1;
}

.image-action-btn {
  background: rgba(0, 0, 0, 0.7);
  border: none;
  border-radius: 4px;
  padding: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
}

.image-action-btn:hover {
  background: rgba(97, 55, 142, 0.9);
}

.image-action-btn .material-symbols-outlined {
  font-size: 18px;
  color: #fff;
}

@keyframes mediaFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.message-image img {
  width: 100%;
  display: block;
}

/* Delete button red tint on hover */
.image-action-btn.delete-btn:hover,
.media-action-btn.delete-btn:hover {
  background: rgba(200, 50, 50, 0.9);
}

/* Generate media button for messages without images */
.generate-media-btn {
  display: flex;
  justify-content: center;
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.generate-media-btn:hover {
  opacity: 1;
}

.generate-media-btn .button {
  border-color: rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.8);
  background: rgba(0, 0, 0, 0.3);
}

.generate-media-btn .button:hover {
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(0, 0, 0, 0.5);
}

.generate-media-btn .button:disabled {
  opacity: 0.5;
  cursor: wait;
}

/* Audio actions overlay */
.message-audio {
  position: relative;
  width: 100% !important;
  animation: mediaFadeIn 0.5s ease-out forwards;
  opacity: 0;
}

.audio-actions {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.message-audio:hover .audio-actions {
  opacity: 1;
}

/* Video actions overlay */
.message-video {
  position: relative;
  animation: mediaFadeIn 0.5s ease-out forwards;
  opacity: 0;
}

.video-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.message-video:hover .video-actions {
  opacity: 1;
}

/* Purchase Intent Card */
.purchase-intent-card {
  background: linear-gradient(
    135deg,
    rgba(138, 43, 226, 0.15),
    rgba(75, 0, 130, 0.1)
  );
  border: 1px solid rgba(138, 43, 226, 0.3);
  border-radius: 8px;
  padding: 0.75rem;
}

.purchase-intent-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.purchase-intent-header .material-symbols-outlined {
  font-size: 18px;
  color: #8a2be2;
}

.purchase-intent-title {
  font-weight: 500;
}

.purchase-intent-body {
  margin-bottom: 0.75rem;
}

.purchase-item {
  font-weight: 600;
  color: #fff;
  font-size: 0.95rem;
  margin-bottom: 0.25rem;
}

.purchase-reason {
  font-style: italic;
}

.purchase-cost {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: rgba(57, 213, 130, 0.9);
  font-size: 0.85rem;
  margin-top: 0.5rem;
}

.purchase-intent-actions {
  display: flex;
  gap: 0.5rem;
}

.purchase-intent-actions .button {
  font-size: 0.75rem;
  padding: 0.25rem 0.75rem;
}

/* Purchase Status Badges */
.purchase-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  margin-top: 0.5rem;
}

.purchase-status-badge .material-symbols-outlined {
  font-size: 14px;
}

.purchase-status-badge.is-approved {
  background: rgba(57, 213, 130, 0.2);
  color: #39d582;
  border: 1px solid rgba(57, 213, 130, 0.3);
}

.purchase-status-badge.is-executed {
  background: rgba(0, 209, 178, 0.2);
  color: #00d1b2;
  border: 1px solid rgba(0, 209, 178, 0.3);
}

.purchase-status-badge.is-executed a {
  color: #00d1b2;
  text-decoration: underline;
}

.purchase-status-badge.is-failed {
  background: rgba(255, 183, 77, 0.2);
  color: #ffb74d;
  border: 1px solid rgba(255, 183, 77, 0.3);
}

.purchase-status-badge.is-rejected {
  background: rgba(255, 56, 96, 0.2);
  color: #ff3860;
  border: 1px solid rgba(255, 56, 96, 0.3);
}

/* Shared media action button */
.media-action-btn {
  background: rgba(0, 0, 0, 0.7);
  border: none;
  border-radius: 4px;
  padding: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
}

.media-action-btn:hover {
  background: rgba(97, 55, 142, 0.9);
}

.media-action-btn .material-symbols-outlined {
  font-size: 18px;
  color: #fff;
}

/* Text delete button */
.message-text {
  position: relative;
}

.text-delete-btn {
  position: absolute;
  top: 0;
  right: -30px;
  background: rgba(0, 0, 0, 0.5);
  border: none;
  border-radius: 4px;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition:
    opacity 0.2s ease,
    background 0.2s ease;
}

.message-text:hover .text-delete-btn {
  opacity: 1;
}

.text-delete-btn:hover {
  background: rgba(200, 50, 50, 0.9);
}

.text-delete-btn .material-symbols-outlined {
  font-size: 16px;
  color: #fff;
}

.message-audio audio {
  width: 100%;
  color-scheme: dark;
}

/* Generation Progress */
.generation-progress {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.generation-items {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.generation-item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(97, 55, 142, 0.3);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.8);
}

.generation-item .material-symbols-outlined {
  font-size: 16px;
}

/* Media Placeholders */
.message-image-placeholder,
.message-audio-placeholder,
.message-video-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 1.5rem;
}

.message-image-placeholder {
  width: 100%;
  max-width: 100%;
  min-height: 150px;
}

.message-audio-placeholder {
  min-height: 50px;
}

.message-video-placeholder {
  width: 100%;
  max-width: 100%;
  min-height: 150px;
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: rgba(255, 255, 255, 0.5);
}

.placeholder-content .material-symbols-outlined {
  font-size: 32px;
}

/* Spinning animation for loading icons */
.spinning {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from {
    transform:;
  }
  to {
    transform: rotate(360deg);
  }
}

/* Typing Indicator */
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  width: fit-content;
}

.typing-indicator.inline {
  display: inline-flex;
  padding: 0.5rem 0.75rem;
  background: transparent;
}

/* Generating media indicator */
.generating-media {
  display: inline-flex;
  align-items: center;
  opacity: 0.8;
}

/* Autonomous mode toggle */
.autonomous-toggle {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  cursor: pointer;
  transition: all 0.2s;
  color: rgba(255, 255, 255, 0.7);
}

.autonomous-toggle:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.autonomous-toggle.active {
  background: rgba(72, 199, 142, 0.2);
  border-color: rgba(72, 199, 142, 0.5);
  color: #48c78e;
}

.autonomous-toggle input[type="checkbox"] {
  display: none;
}

.autonomous-toggle.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* x402 Agent Wallet Status */
.agent-wallet-status {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.agent-wallet-status .button {
  border-color: rgba(255, 255, 255, 0.2);
}

/* Transaction History */
.transaction-item {
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.2s;
}

.transaction-item:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08) !important;
}

.transaction-item.has-background-success-dark {
  border-left: 3px solid #48c78e;
}

.transaction-item.has-background-danger-dark {
  border-left: 3px solid #f14668;
}

/* Missed messages banner */
.missed-messages-banner {
  animation: slideDown 0.3s ease-out;
}

.missed-messages-banner .level {
  margin-bottom: 0;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out both;
}

.typing-indicator span:nth-child(1) {
  animation-delay: -0.32s;
}

.typing-indicator span:nth-child(2) {
  animation-delay: -0.16s;
}

.has-text-brand {
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
}

@keyframes typing {
  0%,
  80%,
  100% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.typing-status {
  margin-top: 0.25rem;
}

/* Suggested Responses */
.suggested-responses {
  padding: 0 1rem;
}

/* Chat Input */
.chat-input {
  padding: 0;
}

.chat-input .input.send,
.chat-input .input.send:focus,
.chat-input .input.send:active {
  box-shadow: none;
  outline: none;
  outline-offset: 0px;
  border: none;
  border-bottom: 2px solid rgba(0, 0, 0, 0.3) !important;
}

/* Appearance editor below chat input */
.appearance-editor {
  margin-top: 6px;
}

.appearance-editor .textarea {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 0.8rem;
  min-height: 50px;
  resize: vertical;
}

.appearance-editor .textarea::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.appearance-btn {
  transition: all 0.2s;
  border-radius: 4px !important;
  font-size: 0.75rem !important;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  flex-shrink: 0;
}
.appearance-btn.is-dark {
  background: rgba(255, 255, 255, 0.08) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  color: rgba(255, 255, 255, 0.7) !important;
}
.appearance-btn.is-dark:hover {
  background: rgba(255, 255, 255, 0.15) !important;
  color: #fff !important;
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

/* Uploaded Image Preview */
.uploaded-image-preview {
  padding: 0 1rem;
}

.uploaded-image-preview .image-container {
  position: relative;
  display: inline-block;
  max-width: 200px;
}

.uploaded-image-preview img {
  max-width: 200px;
  max-height: 150px;
  object-fit: cover;
  border-radius: 8px;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.uploaded-image-preview .delete {
  position: absolute;
  top: -8px;
  right: -8px;
  background: #f14668;
}

.uploaded-image-preview .image-analysis-text {
  max-width: 300px;
  line-height: 1.3;
}

.is-spinning {
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

/* Video in messages */
.message-video {
  width: 100%;
  max-width: 100%;
  border-radius: 8px;
  overflow: hidden;
  margin-top: 0.5rem;
}

.message-video video {
  width: 100%;
  display: block;
}

/* User message with image */
.message.user .message-image {
  margin-top: 0.5rem;
}

.message.user .message-image img {
  max-width: 200px;
  border-radius: 8px;
}

/* Media Options Selector - matches content-level-selector */
.media-selector {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.media-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(0, 0, 0, 0.3);
  padding: 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.2s;
}

.media-option:hover {
  background: rgba(97, 55, 142, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
}

.media-option.is-selected {
  border-color: rgba(255, 255, 255, 1);
  background: rgba(97, 55, 142, 0.33);
  backdrop-filter: blur(64px);
}

.media-option-content {
  flex: 1;
}

.media-option strong {
  color: #fff;
}

.media-option p {
  color: rgba(255, 255, 255, 0.6);
  margin-top: 0.25rem;
}

.media-option.is-unavailable {
  opacity: 0.5;
  cursor: not-allowed;
}

.media-option.is-unavailable:hover {
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.1);
}

.media-icon {
  font-size: 24px;
  margin-right: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  transition: color 0.2s;
}

.media-option.is-selected .media-icon {
  color: #fff;
}

/* Sessions header with import/export */
.sessions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.sessions-header h3 {
  margin: 0;
}

.sessions-actions {
  display: flex;
  gap: 0.5rem;
}

/* Model Requirements Section */
.model-requirements {
  margin-top: 1rem;
}

.requirements-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.requirement-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  font-size: 0.9rem;
}

.requirement-item.is-missing {
  background: rgba(255, 56, 96, 0.1);
}

.requirement-item.is-satisfied {
  background: rgba(72, 199, 142, 0.1);
}

.requirement-item .model-name {
  flex: 1;
  font-weight: 500;
}

.satisfied-requirements {
  padding: 0.75rem;
  background: rgba(72, 199, 142, 0.05);
  border-radius: 8px;
  border: 1px solid rgba(72, 199, 142, 0.2);
}

.requirements-list.is-satisfied {
  gap: 0.25rem;
}

.requirements-list.is-satisfied .requirement-item {
  padding: 0.25rem 0.5rem;
  font-size: 0.85rem;
  background: transparent;
}

.models__activity--payouts {
  padding: 2em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
  border-radius: 4px !important;
}

/* Social Platform Cards */
.social-platform-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 12px;
  transition: border-color 0.2s;
}
.social-platform-card.is-connected {
  border-color: rgba(72, 199, 142, 0.4);
}
.social-platform-card .checkbox {
  font-size: 12px;
  color: #ccc;
}
.social-platform-card .select select {
  background: rgba(0, 0, 0, 0.3);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.15);
}
</style>
