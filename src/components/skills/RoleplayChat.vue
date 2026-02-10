<template>
  <div class="roleplay-chat">
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
            <!-- Delete button (top left, second) -->
            <button
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
                class="companion-name fira-sans-condensed-black-italic is-size-4 has-text-brand"
              >
                <span class="material-symbols-outlined">
                  {{ companion.gender }}
                </span>
                {{ companion.name }}
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
                  <span class="material-symbols-outlined">person</span>
                </div>
                <!-- Regenerate button -->
                <button
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
              </div>
              <hr />
              <p class="companion-desc" style="min-height: 100px">
                {{ companion.description }}
              </p>
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
              <select v-model="customCompanionStyle">
                <option value="romantic">Romantic</option>
                <option value="adventurous">Adventurous</option>
                <option value="mysterious">Mysterious</option>
                <option value="wholesome">Wholesome</option>
                <option value="dark">Dark</option>
              </select>
            </div>
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
              <span class="material-symbols-outlined mr-1" style="font-size: 14px; vertical-align: middle">error</span>
              {{ generationError }}
            </p>
          </div>
          <!-- Generated Custom Companion Preview -->
          <div
            v-if="customCompanion"
            class="custom-companion-preview mt-4 has-text-left"
          >
            <div class="columns is-vcentered">
              <!-- Portrait image -->
              <div class="column is-narrow">
                <div class="custom-preview-portrait">
                  <img
                    v-if="customCompanion.image"
                    :src="getImageSrc(customCompanion.image)"
                    :alt="customCompanion.name"
                    class="companion-preview-img"
                  />
                  <div v-else class="no-portrait">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 64px; opacity: 0.3"
                    >
                      {{
                        getAvatarIcon(
                          customCompanion.avatar,
                          customCompanion.gender,
                        )
                      }}
                    </span>
                  </div>
                </div>
              </div>
              <!-- Info -->
              <div class="column p-4">
                <h5
                  class="fira-sans-condensed-black-italic has-text-success is-size-4"
                >
                  {{ customCompanion.name }}
                </h5>
                <p class="is-size-6 has-text-grey-light mt-2">
                  {{ customCompanion.description }}
                </p>
                <div class="tags mt-3">
                  <span
                    class="tag is-warning is-small"
                    style="text-transform: uppercase"
                  >
                    {{ customCompanion.personality }}
                  </span>
                </div>
                <div class="buttons mt-3">
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

      <!-- Saved Sessions & Import/Export -->
      <div v-if="selectedCompanion" class="models__activity--payouts mb-5">
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
            <button
              class="button is-info is-medium"
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
              <span class="material-symbols-outlined mr-1" style="font-size: 14px; vertical-align: middle">error</span>
              {{ generationError }}
            </p>
          </div>

          <div
            v-if="customScenario"
            class="custom-scenario-preview mt-4 has-text-left"
          >
            <!-- Scene image -->
            <div v-if="customScenario.image" class="custom-preview-image mb-3">
              <img
                :src="getImageSrc(customScenario.image)"
                :alt="customScenario.name"
              />
            </div>
            <div class="p-4">
              <h5
                class="fira-sans-condensed-black-italic has-text-success is-size-4"
              >
                {{ customScenario.name }}
              </h5>
              <p class="is-size-6 has-text-grey-light mt-2">
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
              <div class="buttons mt-4">
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
                  <strong>{{ config.label }}</strong>
                  <p class="is-size-7">{{ config.description }}</p>
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
                  <div class="media-option-content">
                    <strong>Image</strong>
                    <p class="is-size-7">Generate scene illustrations</p>
                  </div>
                  <span
                    v-if="!isModelAvailable('image_turbo')"
                    class="tag is-small is-warning"
                  >
                    Download
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
                  <div class="media-option-content">
                    <strong>Voice</strong>
                    <p class="is-size-7">Companion speaks responses</p>
                  </div>
                  <span
                    v-if="!isModelAvailable('audio_quality')"
                    class="tag is-small is-warning"
                  >
                    Download
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
                  <div class="media-option-content">
                    <strong>Video</strong>
                    <p class="is-size-7">Animate peak emotions</p>
                  </div>
                  <span
                    v-if="!isModelAvailable('video_fast')"
                    class="tag is-small is-warning"
                  >
                    Download
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
                  <div class="media-option-content">
                    <strong>Vision</strong>
                    <p class="is-size-7">Upload images for context</p>
                  </div>
                  <span
                    v-if="!isModelAvailable('vision')"
                    class="tag is-small is-warning"
                  >
                    Download
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- User Description (for image generation consistency) -->
        <div class="columns mt-4" v-if="settings.contentLevel === 'mature' || settings.contentLevel === 'adult'">
          <div class="column is-12">
            <div class="field has-text-left">
              <label
                class="label has-text-white fira-sans-condensed-black-italic is-size-4"
              >
                <span class="material-symbols-outlined mr-2 is-size-2">
                  person
                </span>
                Your Appearance
              </label>
              <p class="is-size-7 has-text-grey-light mb-3">
                Describe your physical appearance for consistent image generation in intimate scenes.
              </p>
              <div class="control">
                <textarea
                  v-model="settings.userDescription"
                  class="textarea"
                  placeholder="e.g., A tall man with dark hair, athletic build, and tanned skin"
                  rows="2"
                ></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Autonomous Mode Integration (shown when companion is selected) -->
      <div v-if="selectedCompanion" class="models__activity--payouts mb-5">
        <h3
          class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4"
        >
          <span class="material-symbols-outlined mr-2 is-size-2">autoplay</span>
          Autonomous Mode
        </h3>
        <hr />

        <div class="columns mt-4">
          <!-- Left column: Timing Settings -->
          <div class="column is-6">
            <div class="field has-text-left">
              <label
                class="label has-text-white is-size-5 mb-3 fira-sans-condensed-black-italic"
              >
                <span class="material-symbols-outlined mr-1">cardiology</span>
                Heartbeat Settings
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
              <div class="field">
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
            </div>
          </div>

          <!-- Right column: Moltbook Integration -->
          <div class="column is-6">
            <div class="field has-text-left">
              <label
                class="label has-text-white is-size-5 mb-3 fira-sans-condensed-black-italic"
              >
                <span class="material-symbols-outlined mr-1">communities</span>
                Moltbook Social Network
              </label>

              <!-- Moltbook Configuration -->
              <div
                v-if="!companionMoltbookRegistered"
                class="moltbook-register mb-4"
              >
                <p class="is-size-7 has-text-grey-light mb-3">
                  Connect {{ selectedCompanion?.name }} to Moltbook for
                  autonomous social presence.
                </p>

                <!-- Registration Mode Tabs -->
                <div class="moltbook-tabs mb-4">
                  <button
                    class="button is-small"
                    :class="{ 'is-info': moltbookMode === 'register' }"
                    @click="moltbookMode = 'register'"
                  >
                    <span class="material-symbols-outlined mr-1" style="font-size: 14px">person_add</span>
                    Register New
                  </button>
                  <button
                    class="button is-small ml-2"
                    :class="{ 'is-info': moltbookMode === 'existing' }"
                    @click="moltbookMode = 'existing'"
                  >
                    <span class="material-symbols-outlined mr-1" style="font-size: 14px">key</span>
                    Use Existing
                  </button>
                </div>

                <!-- Register New Account -->
                <div v-if="moltbookMode === 'register'">
                  <p class="is-size-7 has-text-grey-light mb-3">
                    Create a new Moltbook account for {{ selectedCompanion?.name }}.
                    You'll receive a claim URL to verify ownership.
                  </p>

                  <!-- Registration Result -->
                  <div v-if="moltbookRegistrationResult" class="notification is-info is-light mb-4">
                    <p class="is-size-7 mb-2">
                      <strong>Account Created!</strong>
                    </p>
                    <p class="is-size-7 mb-2">
                      Username: <strong>@{{ moltbookRegistrationResult.username }}</strong>
                    </p>
                    <p class="is-size-7 mb-2">
                      Claim your companion's account by visiting:
                    </p>
                    <a
                      :href="moltbookRegistrationResult.claimUrl"
                      target="_blank"
                      class="is-size-7 has-text-info"
                      style="word-break: break-all"
                    >
                      {{ moltbookRegistrationResult.claimUrl }}
                    </a>
                    <p class="is-size-7 mt-2 has-text-grey">
                      Verification code: <code>{{ moltbookRegistrationResult.verificationCode }}</code>
                    </p>
                  </div>

                  <button
                    class="button is-success is-medium"
                    @click="registerMoltbookAccount"
                    :disabled="isRegisteringMoltbook || moltbookRegistrationResult"
                  >
                    <span
                      v-if="isRegisteringMoltbook"
                      class="material-symbols-outlined rotating mr-2"
                    >
                      progress_activity
                    </span>
                    <span class="material-symbols-outlined mr-2" v-else>
                      person_add
                    </span>
                    {{ isRegisteringMoltbook ? "Registering..." : moltbookRegistrationResult ? "Registered" : "Register on Moltbook" }}
                  </button>
                </div>

                <!-- Use Existing Credentials -->
                <div v-else>
                  <!-- Username Input -->
                  <div class="field mb-4">
                    <label class="label has-text-grey-light is-size-7">
                      Moltbook Username
                    </label>
                    <div class="control">
                      <input
                        type="text"
                        class="input is-medium"
                        v-model="moltbookUsername"
                        placeholder="e.g., @companion_name"
                      />
                    </div>
                  </div>

                  <!-- API Key Input -->
                  <div class="field mb-3">
                    <label class="label has-text-grey-light is-size-7">
                      Moltbook API Key
                    </label>
                    <div class="control">
                      <input
                        type="password"
                        class="input is-small"
                        v-model="moltbookApiKey"
                        placeholder="moltbook_xxx..."
                      />
                    </div>
                    <p class="help has-text-grey-light">
                      Get your API key from <a href="https://www.moltbook.com/settings" target="_blank" class="has-text-info">moltbook.com/settings</a>
                    </p>
                  </div>

                  <!-- Save Button -->
                  <button
                    class="button is-info is-medium mt-1"
                    @click="saveMoltbookCredentials"
                    :disabled="
                      !moltbookApiKey || !moltbookUsername || isSavingMoltbook
                    "
                  >
                    <span
                      v-if="isSavingMoltbook"
                      class="material-symbols-outlined rotating mr-2"
                    >
                      progress_activity
                    </span>
                    <span class="material-symbols-outlined mr-2" v-else>
                      save
                    </span>
                    {{ isSavingMoltbook ? "Saving..." : "Save Credentials" }}
                  </button>
                </div>
              </div>

              <!-- Moltbook Settings (when registered) -->
              <div v-else class="moltbook-settings-panel">
                <div class="moltbook-status mb-3">
                  <span class="tag is-success is-small mr-2">Connected</span>
                  <a
                    :href="companionMoltbookUrl"
                    target="_blank"
                    class="is-size-7 has-text-info mr-3"
                  >
                    <span
                      class="material-symbols-outlined mr-1"
                      style="font-size: 12px; vertical-align: middle"
                    >
                      open_in_new
                    </span>
                    View Profile
                  </a>
                  <button
                    class="button is-small is-text is-size-7 has-text-grey"
                    @click="disconnectMoltbook"
                    title="Disconnect from Moltbook"
                  >
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 12px"
                    >
                      link_off
                    </span>
                  </button>
                </div>

                <!-- Moltbook Feature Toggles -->
                <div class="moltbook-options">
                  <label class="checkbox mb-2 is-block">
                    <input
                      type="checkbox"
                      v-model="settings.moltbook.autoPost"
                    />
                    <span class="ml-2 is-size-7">
                      Post thought-leadership content
                    </span>
                  </label>
                  <label class="checkbox mb-2 is-block">
                    <input
                      type="checkbox"
                      v-model="settings.moltbook.autoEngage"
                    />
                    <span class="ml-2 is-size-7">
                      Engage with feed (upvote, comment)
                    </span>
                  </label>
                  <label class="checkbox mb-3 is-block">
                    <input
                      type="checkbox"
                      v-model="settings.moltbook.promoteBonzai"
                    />
                    <span class="ml-2 is-size-7">
                      Include BonzAI promotion signature
                    </span>
                  </label>
                </div>

                <!-- Moltbook Post Interval -->
                <div class="field mb-3">
                  <label class="label has-text-grey-light is-size-7">
                    Post Interval (hours between Moltbook posts)
                  </label>
                  <div class="control">
                    <div class="select is-small">
                      <select v-model.number="settings.moltbook.postInterval">
                        <option :value="6">Every 6 hours</option>
                        <option :value="12">Every 12 hours</option>
                        <option :value="24">Daily (default)</option>
                        <option :value="48">Every 2 days</option>
                        <option :value="168">Weekly</option>
                      </select>
                    </div>
                  </div>
                </div>

                <!-- Recent Activity Log -->
                <div
                  v-if="moltbookActivityLog.length > 0"
                  class="moltbook-activity-log mt-3"
                >
                  <p class="is-size-7 has-text-grey-light mb-2">
                    Recent activity:
                  </p>
                  <div class="moltbook-activity-list">
                    <div
                      v-for="activity in moltbookActivityLog.slice(-5)"
                      :key="activity.id"
                      class="moltbook-activity-item is-size-7"
                    >
                      <span
                        class="material-symbols-outlined mr-1"
                        style="font-size: 12px; vertical-align: middle"
                      >
                        {{
                          activity.action === "posted"
                            ? "edit_note"
                            : "thumb_up"
                        }}
                      </span>
                      {{ activity.action }}:
                      {{ activity.title?.substring(0, 35)
                      }}{{ activity.title?.length > 35 ? "..." : "" }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Start Button -->
      <div class="control has-text-center models__activity--payouts">
        <button
          class="button is-success is-large"
          :disabled="!canStart"
          @click="startNewChat"
        >
          <span class="material-symbols-outlined mr-2">play_arrow</span>
          {{ matchingSession ? "Start New / Resume" : "Start Roleplay" }}
        </button>
        <p
          v-if="!canStartChat && modelAvailabilityChecked"
          class="help has-text-danger mt-2"
        >
          <span
            class="material-symbols-outlined"
            style="font-size: 14px; vertical-align: middle"
          >
            error
          </span>
          Download the required models above first
        </p>
      </div>

      <!-- Session Manager Modal (shown when existing session found) -->
      <div v-if="showSessionManager" class="session-manager-overlay">
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
        <div class="columns is-vcentered">
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
                <h3 class="fira-sans-condensed-black-italic has-text-white">
                  {{ selectedCompanion?.name }}
                </h3>
                <p class="has-text-grey-light is-size-7">
                  {{ selectedScenario?.name }}
                </p>
              </div>
            </div>
          </div>
          <div class="tags has-addons mt-5">
            <span class="tag is-info is-medium">{{ settings.contentLevel }}</span>
            <span class="tag is-dark is-medium">text</span>
            <span class="tag is-dark is-medium" v-if="settings.enableAudio">audio</span>
            <span class="tag is-dark is-medium" v-if="settings.enableImage">image</span>
            <span class="tag is-dark is-medium" v-if="settings.enableVideo">video</span>
            <span class="tag is-dark is-medium" v-if="settings.enableVision">video</span>
          </div>
          <div class="column is-narrow">
            <!-- Autonomous Mode Toggle -->
            <label
              class="checkbox autonomous-toggle mr-3"
              :class="{ active: autonomousModeDisplay, disabled: isInitializingSession }"
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
                {{ isInitializingSession ? "Setting scene..." : autonomousPending ? "Starting..." : "Autonomous Mode" }}
              </span>
            </label>
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
                    title="Regenerate image with enhanced prompt"
                  >
                    <span class="material-symbols-outlined">{{ regeneratingMediaIdx === idx ? 'hourglass_empty' : 'refresh' }}</span>
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
                    title="Create video from image"
                  >
                    <span class="material-symbols-outlined">movie</span>
                  </button>
                  <button
                    class="image-action-btn"
                    @click="regenerateMedia(idx, false, true)"
                    :disabled="regeneratingMediaIdx === idx"
                    title="Generate video from this image"
                  >
                    <span class="material-symbols-outlined">{{ regeneratingMediaIdx === idx ? 'hourglass_empty' : 'slow_motion_video' }}</span>
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
              :disabled="isInitializingSession || (!userMessage.trim() && !uploadedImage)"
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
  CONTENT_LEVELS,
  MODEL_REQUIREMENTS,
  roleplayCompanion,
  clearAllMemory,
  validateCompanionAge,
  sanitizeCompanionAge,
  regenerateMessageMedia,
} from "../../skills/flagship.js";
import { useSkillStore } from "../../stores/skillStore.js";
import { moltbookService } from "../../services/moltbook.service.js";
import { io } from "socket.io-client";

export default {
  name: "RoleplayChat",
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

    // Phase management
    const phase = ref("setup"); // 'setup' | 'chat'

    // Setup state
    const selectedCompanion = ref(null);
    const selectedScenario = ref(null);
    const showCustomCompanion = ref(false);
    const showCustomScenario = ref(false);
    const customCompanionPrompt = ref("");
    const customCompanionStyle = ref("romantic");
    const customScenarioPrompt = ref("");
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

    // Parse keywords from a comma-separated string
    const parseKeywords = (keywordString) => {
      if (!keywordString) return [];
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

    // Initialize keyword cycling on mount
    onMounted(() => {
      startKeywordCycling();
    });

    // Cleanup on unmount
    onUnmounted(() => {
      if (keywordCycleInterval) {
        clearInterval(keywordCycleInterval);
        keywordCycleInterval = null;
      }
    });

    const settings = ref({
      contentLevel: "pg13",
      // User's appearance description for image generation consistency
      userDescription: "",
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
      },
      // Moltbook settings
      moltbook: {
        enabled: false, // Master toggle (set when registered)
        autoPost: true, // Post thought-leadership content
        autoEngage: true, // Upvote/comment on relevant posts
        promoteBonzai: true, // Include BonzAI mentions
        postInterval: 24, // Hours between posts (default: daily)
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

    // Required LLM for roleplay
    const REQUIRED_LLM = "llm_mythomax_13b";
    const requiredLLMName = computed(
      () => MODEL_REQUIREMENTS[REQUIRED_LLM]?.name || "MythoMax L2 13B",
    );

    // Check if a specific model is available
    const isModelAvailable = (modelKey) => {
      return modelAvailability[modelKey] === true;
    };

    // Get required models based on current media selection
    const requiredModelsForSelection = computed(() => {
      const required = [REQUIRED_LLM]; // LLM is always required
      if (settings.value.enableImage) required.push("image_turbo");
      if (settings.value.enableAudio) required.push("audio_quality"); // Qwen3-TTS
      if (settings.value.enableVideo) required.push("video_fast");
      if (settings.value.enableVision) required.push("vision");
      return required;
    });

    // Get missing models (required but not available)
    const missingModels = computed(() => {
      if (!modelAvailabilityChecked.value) return [];
      return requiredModelsForSelection.value.filter(
        (key) => !isModelAvailable(key),
      );
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

    // Check if chat can start (LLM + all selected media models must be available)
    const canStartChat = computed(() => {
      if (!modelAvailabilityChecked.value) return false;
      return missingModels.value.length === 0;
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

      // Check Flask pipelines
      const pipelineMap = {
        image_turbo: "image_turbo",
        image_standard: "image_standard",
        image_quality: "image_quality",
        audio_quality: "audio_quality_persona", // Qwen3-TTS for companion audio
        video_fast: "video_fast",
        vision: "qwen3_vision",
      };

      const checks = Object.entries(pipelineMap).map(
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

          // When a download completes, refresh model availability
          if (pipeline.status === "completed") {
            console.log(
              "[RoleplayChat] Download completed, refreshing model availability",
            );
            checkModelAvailability();
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
    const isSavingMoltbook = ref(false);
    const isRegisteringMoltbook = ref(false);
    const moltbookMode = ref("register"); // 'register' or 'existing'
    const moltbookRegistrationResult = ref(null); // { claimUrl, verificationCode, apiKey }
    const moltbookActivityLog = computed(
      () => skillStore.moltbookState.activityLog || [],
    );

    // Check if companion is registered on Moltbook
    const companionMoltbookRegistered = computed(() => {
      if (!selectedCompanion.value?.id) return false;
      const creds = moltbookService.getCredentials(selectedCompanion.value.id);
      return !!creds?.apiKey;
    });

    // Get companion's Moltbook profile URL
    const companionMoltbookUrl = computed(() => {
      if (!selectedCompanion.value?.id) return "#";
      const creds = moltbookService.getCredentials(selectedCompanion.value.id);
      const username =
        creds?.username || selectedCompanion.value.name || "companion";
      return `https://www.moltbook.com/u/${encodeURIComponent(username)}`;
    });

    // Scene state for smart image generation and anti-repetition
    const sceneState = ref({
      lastImageAt: -3, // Message index of last image (-3 to allow first message to have image)
      currentLocation: "", // Current location/setting
      recentEmotions: [], // Last few emotions (for variety)
      recentActions: [], // Last few actions (for variety)
      lastOpeningPhrase: "", // Last response opening (avoid repetition)
    });

    // Media regeneration state
    const regeneratingMediaIdx = ref(null); // Index of message currently regenerating media

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
      if (!key || (chatHistory.value.length === 0 && !scenarioBackgroundImage.value)) {
        console.log("[Roleplay] Skip save: no key or empty session");
        return;
      }

      // Convert Vue reactive proxies to plain objects for Electron IPC
      // Use JSON.parse(JSON.stringify()) to deep clone and remove non-serializable data
      const plainCompanion = JSON.parse(
        JSON.stringify(toRaw(selectedCompanion.value)),
      );
      const plainScenario = JSON.parse(
        JSON.stringify(toRaw(selectedScenario.value)),
      );
      const plainSettings = JSON.parse(JSON.stringify(toRaw(settings.value)));
      const plainSceneState = JSON.parse(
        JSON.stringify(toRaw(sceneState.value)),
      );

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
          const plainMsg = JSON.parse(JSON.stringify(toRaw(msg)));
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

    // Load a specific session by key
    const loadSession = async (key) => {
      const session = savedSessions.value[key];
      if (!session) return false;

      selectedCompanion.value = session.companion;
      selectedScenario.value = session.scenario;

      // Load Moltbook credentials for this companion
      await loadMoltbookCredentials();

      // Handle both old (responseMode string) and new (checkbox) settings formats
      const savedSettings = session.settings || {};
      console.log(`[Roleplay] Restoring session settings:`, savedSettings);

      // Default autonomous settings
      const defaultAutonomous = {
        idleTimeout: 5,
        messageInterval: 15,
        maxMessages: 12,
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
        settings.value = {
          ...savedSettings,
          autonomous: { ...defaultAutonomous, ...savedSettings.autonomous },
          moltbook: { ...defaultMoltbook, ...savedSettings.moltbook },
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
        ...JSON.parse(JSON.stringify(toRaw(customCompanion.value))),
        id: customCompanion.value.id || `companion_${Date.now()}`,
        createdAt: Date.now(),
      };

      // Sanitize age
      sanitizeCompanionAge(companionToSave);

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

    // Delete a companion
    const deleteCompanion = async (companionId) => {
      if (!companionId) return;

      const idx = companions.value.findIndex((c) => c.id === companionId);
      if (idx < 0) return;

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
        ...JSON.parse(JSON.stringify(toRaw(customScenario.value))),
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
            const checkInterval = setInterval(() => {
              if (!isInitializingSession.value) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 500);
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
          // Poll until generation is complete
          await new Promise((resolve) => {
            const checkInterval = setInterval(() => {
              if (!isProcessingMessage.value && !isTyping.value) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 500);
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

    /**
     * Load Moltbook credentials for the current companion
     */
    const loadMoltbookCredentials = async () => {
      if (!selectedCompanion.value?.id) return;
      try {
        const creds = await moltbookService.loadCredentials(
          selectedCompanion.value.id,
        );
        if (creds?.apiKey) {
          settings.value.moltbook.enabled = true;
          console.log(
            `[Roleplay] Moltbook credentials loaded for ${selectedCompanion.value.name}`,
          );
        }
      } catch (e) {
        console.warn(
          "[Roleplay] Failed to load Moltbook credentials:",
          e.message,
        );
      }
    };

    /**
     * Register a new Moltbook account for the current companion
     */
    const registerMoltbookAccount = async () => {
      if (!selectedCompanion.value) return;

      isRegisteringMoltbook.value = true;
      moltbookRegistrationResult.value = null;

      try {
        const result = await moltbookService.registerCompanion(selectedCompanion.value);

        if (result.apiKey) {
          moltbookRegistrationResult.value = {
            claimUrl: result.claimUrl,
            verificationCode: result.verificationCode,
            apiKey: result.apiKey,
            username: result.username, // The unique username generated
          };

          // Enable Moltbook since we now have credentials
          settings.value.moltbook.enabled = true;

          console.log(
            `[Roleplay] ${selectedCompanion.value.name} registered on Moltbook`,
            { claimUrl: result.claimUrl }
          );

          // Auto-subscribe to relevant communities
          try {
            await moltbookService.autoSubscribeToSubmolts(selectedCompanion.value.id);
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
      if (
        !selectedCompanion.value ||
        !moltbookApiKey.value ||
        !moltbookUsername.value
      )
        return;

      isSavingMoltbook.value = true;
      try {
        const credentials = {
          apiKey: moltbookApiKey.value.trim(),
          username: moltbookUsername.value.trim().replace(/^@/, ""), // Remove @ prefix if present
          status: "configured",
          configuredAt: Date.now(),
        };

        await moltbookService.storeCredentials(
          selectedCompanion.value.id,
          credentials,
        );
        settings.value.moltbook.enabled = true;

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
          backgroundHistory.value
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
        sessions: JSON.parse(JSON.stringify(toRaw(savedSessions.value))),
        customCompanions: JSON.parse(JSON.stringify(toRaw(companions.value))),
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
    const resumeSession = (key) => {
      if (loadSession(key)) {
        phase.value = "chat";
        showSessionManager.value = false;
        suggestedResponses.value = [];
        nextTick(() => {
          chatInput.value?.focus();
          scrollToBottom();
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

          if (stored && stored.length > 0) {
            // Filter out any invalid (underage) companions and sanitize ages
            const validCompanions = stored.filter((c) => {
              const validation = validateCompanionAge(c);
              if (!validation.valid) {
                console.warn(
                  `[Roleplay] Removed invalid companion "${c.name}": ${validation.reason}`,
                );
                return false;
              }
              sanitizeCompanionAge(c);
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
                image: null,
              }));
              companions.value = [...validCompanions, ...newDefaults];
              await saveCompanions();
            } else {
              companions.value = validCompanions;
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
          } else {
            // First run - seed with defaults
            companions.value = DEFAULT_COMPANIONS.map((c) => ({
              ...c,
              image: null,
            }));
            await saveCompanions();
            console.log(
              `[Roleplay] Seeded ${companions.value.length} default companions`,
            );
          }
        } else {
          companions.value = DEFAULT_COMPANIONS.map((c) => ({
            ...c,
            image: null,
          }));
        }
      } catch (e) {
        console.error("[Roleplay] Failed to load companions:", e);
        companions.value = DEFAULT_COMPANIONS.map((c) => ({
          ...c,
          image: null,
        }));
      }
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
                image: null,
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
              image: null,
            }));
            await saveScenarios();
            console.log(
              `[Roleplay] Seeded ${scenarios.value.length} default scenarios`,
            );
          }
        } else {
          scenarios.value = DEFAULT_SCENARIOS.map((s) => ({
            ...s,
            image: null,
          }));
        }
      } catch (e) {
        console.error("[Roleplay] Failed to load scenarios:", e);
        scenarios.value = DEFAULT_SCENARIOS.map((s) => ({ ...s, image: null }));
      }
    };

    // Save companions to storage
    const saveCompanions = async () => {
      try {
        if (window.electronAPI?.store?.set) {
          await window.electronAPI.store.set(
            COMPANIONS_KEY,
            JSON.parse(JSON.stringify(toRaw(companions.value))),
          );
          console.log(`[Roleplay] Saved ${companions.value.length} companions`);
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
            JSON.parse(JSON.stringify(toRaw(scenarios.value))),
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
    const onMessagesScroll = (event) => {
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
      if (!isModelAvailable(modelKey)) return;
      settings.value[option] = !settings.value[option];
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

      // Reset Moltbook registration state when switching companions
      moltbookRegistrationResult.value = null;
      moltbookMode.value = "register";

      // Load Moltbook credentials for this companion
      await loadMoltbookCredentials();
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

      try {
        // Generate companion profile with LLM
        const result = await roleplayCompanion.execution.generateCompanion(
          {
            description: customCompanionPrompt.value,
            style: customCompanionStyle.value,
          },
          { updateStatus: (s) => console.log("[Roleplay]", s) },
        );

        if (generationCancelled.value) return;

        // Age validation - reject underage companions
        const ageValidation = validateCompanionAge(result);
        if (!ageValidation.valid) {
          generationError.value = `Cannot create companion: ${ageValidation.reason}`;
          isGenerating.value = false;
          typingStatus.value = "";
          return;
        }

        // Sanitize age to ensure it's at least 18
        sanitizeCompanionAge(result);

        // Generate companion portrait image using /image/advanced (square)
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
          generationError.value = `Failed to generate companion. Please try again.`;
        }
      } finally {
        isGenerating.value = false;
        typingStatus.value = "";
      }
    };

    const useCustomCompanion = () => {
      if (customCompanion.value) {
        // Final age validation safeguard
        const ageValidation = validateCompanionAge(customCompanion.value);
        if (!ageValidation.valid) {
          alert(`Cannot use companion: ${ageValidation.reason}`);
          return;
        }
        selectedCompanion.value = customCompanion.value;
        showCustomCompanion.value = false;
      }
    };

    const generateCustomScenario = async () => {
      if (!customScenarioPrompt.value || isGenerating.value) return;
      isGenerating.value = true;
      generationError.value = null;
      generationCancelled.value = false;

      try {
        // Generate scenario profile with LLM
        const result = await roleplayCompanion.execution.generateScenario(
          { description: customScenarioPrompt.value, mood: "romantic" },
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
          generationError.value = `Failed to generate scenario. Please try again.`;
        }
      } finally {
        isGenerating.value = false;
        typingStatus.value = "";
      }
    };

    const useCustomScenario = () => {
      if (customScenario.value) {
        selectedScenario.value = customScenario.value;
        showCustomScenario.value = false;
      }
    };

    // State for image regeneration
    const isRegeneratingImage = ref(false);
    const regeneratingId = ref(null);

    /**
     * Regenerate companion portrait image (uses /image/advanced)
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

      // Initialize session with background image generation
      if (
        selectedCompanion.value &&
        selectedScenario.value &&
        settings.value.enableImage
      ) {
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

      // Initialize session with background image generation
      if (
        selectedCompanion.value &&
        selectedScenario.value &&
        settings.value.enableImage
      ) {
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
    };

    // Resume the matching session (same companion + scenario + settings)
    const resumeMatchingSession = () => {
      const key = currentSessionKey.value;
      if (key && loadSession(key)) {
        phase.value = "chat";
        showSessionManager.value = false;
        suggestedResponses.value = [];
        nextTick(() => {
          chatInput.value?.focus();
          scrollToBottom();
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
     * Regenerate image and/or video for a message using enhanced LLM-based prompt generation.
     * This creates more accurate visuals by analyzing the full response text.
     */
    const regenerateMedia = async (messageIdx, regenerateImage = true, regenerateVideo = false) => {
      const msg = chatHistory.value[messageIdx];
      if (!msg || msg.role !== 'assistant') return;

      regeneratingMediaIdx.value = messageIdx;
      typingStatus.value = 'Creating enhanced visual...';

      try {
        const result = await regenerateMessageMedia({
          message: msg,
          companion: selectedCompanion.value,
          scenario: selectedScenario.value,
          contentLevel: settings.value.contentLevel,
          sceneState: {
            ...sceneState.value,
            userAppearance: settings.value.userDescription || 'a man',
          },
        }, {
          regenerateImage,
          regenerateVideo,
          onProgress: (progress) => {
            if (progress.type === 'status') {
              typingStatus.value = progress.message;
            } else if (progress.type === 'image') {
              chatHistory.value[messageIdx].image = progress.image;
            } else if (progress.type === 'video') {
              chatHistory.value[messageIdx].video = progress.video;
            }
          },
        });

        // Update message with regenerated media
        if (result.image) {
          chatHistory.value[messageIdx].image = result.image;
        }
        if (result.video) {
          chatHistory.value[messageIdx].video = result.video;
        }

        // Save session with updated media
        await saveSession();
        console.log(`[RoleplayChat] Regenerated media for message ${messageIdx}`);
      } catch (e) {
        console.error('[RoleplayChat] Failed to regenerate media:', e);
      } finally {
        regeneratingMediaIdx.value = null;
        typingStatus.value = '';
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
              "X-Demo-Mode": "true",
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
              userAppearance: settings.value.userDescription || 'a man',
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
                const responseText = progress.response?.response;
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
                // Update scenario background image when location changes
                if (progress.response.backgroundImage) {
                  scenarioBackgroundImage.value =
                    progress.response.backgroundImage;
                  // Add to background history for scroll-based switching
                  backgroundHistory.value.push({
                    messageIndex: chatHistory.value.length - 1,
                    image: progress.response.backgroundImage,
                    location: progress.response.newLocation || "unknown",
                  });
                  console.log(
                    "[RoleplayChat] Background image updated from location change",
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
            const finalContent = result.response?.response;
            console.log(
              `[RoleplayChat] Final update, content length: ${finalContent?.length || 0}, preview: "${finalContent?.substring(0, 50) || "EMPTY"}"`,
            );
            msg.content = finalContent;
            msg.emotion = result.response.emotion;
            msg.action = result.response.action;
            msg.image = result.response.image;
            msg.audio = result.response.audio;
            msg.video = result.response.video;
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
              (entry) => entry.image === result.response.backgroundImage
            );
            if (!existingEntry) {
              backgroundHistory.value.push({
                messageIndex: assistantMessageIndex,
                image: result.response.backgroundImage,
                location: result.response.newLocation || result.sceneState?.currentLocation || "unknown",
              });
              console.log("[RoleplayChat] Background added to history from result");
            }
            console.log("[RoleplayChat] Background image updated from result");
          }

          // Update suggested responses
          if (result.response.suggestedResponses) {
            suggestedResponses.value = result.response.suggestedResponses;
          }

          // Log smart image decision for debugging
          if (result.meta?.imageSkipped) {
            console.log(
              `[Roleplay] Image skipped: shouldVisualize=${result.meta.shouldVisualize}`,
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
        console.log('[Roleplay] Cannot send message - scene setup in progress');
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

            // Sync history and scene state
            chatHistory.value = [...storeData.history];
            sceneState.value = { ...storeData.sceneState };

            // Enter chat phase
            phase.value = "chat";

            // Clear missed messages since we're viewing them now
            skillStore.clearMissedMessages();

            // Scroll to see new messages
            nextTick(() => scrollToBottom());
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

      // Just sync the current state to store if autonomous mode is active
      if (skillStore.autonomousMode && phase.value === "chat") {
        skillStore.syncAutonomousHistory(
          chatHistory.value,
          sceneState.value,
          scenarioBackgroundImage.value,
          backgroundHistory.value
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

    return {
      phase,
      selectedCompanion,
      selectedScenario,
      showCustomCompanion,
      showCustomScenario,
      customCompanionPrompt,
      customCompanionStyle,
      customScenarioPrompt,
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
      companions,
      scenarios,
      contentLevels,
      canStart,
      // Scene state for smart image generation
      sceneState,
      rebuildSceneState,
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
      // Moltbook integration
      moltbookApiKey,
      moltbookUsername,
      isSavingMoltbook,
      isRegisteringMoltbook,
      moltbookMode,
      moltbookRegistrationResult,
      moltbookActivityLog,
      companionMoltbookRegistered,
      companionMoltbookUrl,
      registerMoltbookAccount,
      saveMoltbookCredentials,
      disconnectMoltbook,
      loadMoltbookCredentials,
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
      clearUploadedImage,
      // Model availability
      modelAvailability,
      modelAvailabilityChecked,
      isModelAvailable,
      toggleMediaOption,
      canStartChat,
      requiredLLMName,
      requiredModelsForSelection,
      missingModels,
      satisfiedModels,
      getModelInfo,
      responseMode,
    };
  },
};
</script>

<style scoped>
.roleplay-chat {
  width: 100%;
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
}

.regenerate-portrait-btn:hover {
  transform: scale(1.1);
}

.companion-portrait-container:hover .regenerate-portrait-btn {
  opacity: 1;
}

.regenerate-portrait-btn:hover {
  background: rgba(50, 115, 220, 1);
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

.companion-desc,
.scenario-desc {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.85rem;
  line-height: 1.4;
}

.custom-companion-form,
.custom-scenario-form {
  background: rgba(0, 0, 0, 0.4);
  border-radius: 8px;
}

.custom-companion-preview,
.custom-scenario-preview {
  background: rgba(97, 55, 142, 0.2);
  border-radius: 8px;
  border: 1px solid rgba(97, 55, 142, 0.6);
  overflow: hidden;
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
  height: 24px;
  overflow: hidden;
  margin-top: 0.5rem;
}

.keyword-item {
  display: inline-block;
  text-transform: uppercase;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
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
  max-width: 70%;
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
</style>
