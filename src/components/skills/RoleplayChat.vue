<template>
  <div class="roleplay-chat">
    <!-- Setup Phase -->
    <div v-if="phase === 'setup'" class="setup-phase">
      <!-- Companion Selection -->
      <div class="models__activity--payouts mb-5">
        <h3
          class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4"
        >
          <span class="material-symbols-outlined mr-2 is-size-1">
            person_pin
          </span>
          Select Companion
        </h3>
        <hr />
        <!-- Predefined Companions -->
        <div class="companion-grid mt-5 pt-5">
          <div
            v-for="companion in predefinedCompanions"
            :key="companion.id"
            class="companion-card has-text-left"
            :class="{
              'is-selected': selectedCompanion?.id === companion.id,
              'has-session': getSessionInfo(companion),
            }"
            @click="selectCompanion(companion)"
          >
            <div class="companion-avatar">
              <span class="material-symbols-outlined">
                {{ getAvatarIcon(companion.avatar, companion.gender) }}
              </span>
              <!-- Session indicator badge -->
              <span
                v-if="getSessionInfo(companion)"
                class="session-badge"
                :title="
                  getSessionInfo(companion).sessionCount +
                  ' session(s), ' +
                  getSessionInfo(companion).messageCount +
                  ' total msgs'
                "
              >
                {{ getSessionInfo(companion).sessionCount }}
              </span>
            </div>
            <div class="companion-info">
              <h4
                class="companion-name fira-sans-condensed-black-italic is-size-4 has-text-brand"
              >
                {{ companion.name }}
              </h4>
              <hr />
              <p class="companion-desc" style="min-height: 100px">
                {{ companion.description }}
              </p>
              <hr />
              <p
                class="has-text-white mt-5 is-size-7"
                style="text-transform: uppercase; word-wrap: break-word"
              >
                {{ companion.personality }}
              </p>
            </div>
          </div>

          <!-- Saved Custom Companions -->
          <div
            v-for="companion in savedCustomCompanions"
            :key="companion.id"
            class="companion-card is-saved-custom has-text-left"
            :class="{
              'is-selected': selectedCompanion?.id === companion.id,
              'has-session': getSessionInfo(companion),
            }"
            @click="selectCompanion(companion)"
          >
            <div class="companion-avatar">
              <span class="material-symbols-outlined">
                {{ getAvatarIcon(companion.avatar, companion.gender) }}
              </span>
              <!-- Session indicator badge -->
              <span
                v-if="getSessionInfo(companion)"
                class="session-badge"
                :title="
                  getSessionInfo(companion).sessionCount +
                  ' session(s), ' +
                  getSessionInfo(companion).messageCount +
                  ' total msgs'
                "
              >
                {{ getSessionInfo(companion).sessionCount }}
              </span>
              <!-- Custom badge -->
              <span class="custom-badge" title="Custom character">
                <span class="material-symbols-outlined" style="font-size: 10px">
                  auto_awesome
                </span>
              </span>
            </div>
            <div class="companion-info">
              <h4
                class="companion-name fira-sans-condensed-black-italic is-size-4 has-text-brand"
              >
                {{ companion.name }}
              </h4>
              <hr />
              <p class="companion-desc" style="min-height: 100px">
                {{ companion.description }}
              </p>
              <hr />
              <p
                class="has-text-white mt-5 is-size-7"
                style="text-transform: uppercase; word-wrap: break-word"
              >
                {{ companion.personality }}
              </p>
            </div>
            <!-- Delete button -->
            <button
              class="delete-custom-btn"
              @click.stop="deleteCustomCompanion(companion.id)"
              title="Delete character"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <!-- Custom Companion Card -->
          <div
            class="companion-card is-custom has-text-left"
            :class="{ 'is-selected': selectedCompanion?.isCustom }"
            @click="openCustomCompanion"
          >
            <div class="companion-avatar">
              <span class="material-symbols-outlined">add</span>
            </div>
            <div class="companion-info">
              <h4
                class="companion-name fira-sans-condensed-black-italic is-size-4"
              >
                Create Custom
              </h4>
              <p class="companion-desc">Design your own companion</p>
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
            <div class="select is-medium mr-2">
              <select v-model="customCompanionStyle">
                <option value="romantic">Romantic</option>
                <option value="adventurous">Adventurous</option>
                <option value="mysterious">Mysterious</option>
                <option value="wholesome">Wholesome</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <button
              class="button is-info is-medium mt-2"
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
              class="button is-danger is-medium mt-2"
              @click="showCustomCompanion = false"
            >
              Cancel
            </button>
          </div>
          <!-- Generated Custom Companion Preview -->
          <div
            v-if="customCompanion"
            class="custom-companion-preview mt-4 p-6 has-text-left"
          >
            <h5
              class="fira-sans-condensed-black-italic has-text-success is-size-4"
            >
              {{ customCompanion.name }}
            </h5>
            <p class="is-size-6 has-text-grey-light mt-2">
              {{ customCompanion.description }}
            </p>
            <div class="tags mt-4">
              <span
                class="tag is-warning is-small"
                style="text-transform: uppercase"
              >
                {{ customCompanion.personality }}
              </span>
            </div>
            <div class="buttons mt-2">
              <button
                class="button is-success is-medium mr-5"
                @click="useCustomCompanion"
              >
                <span class="material-symbols-outlined mr-2">check</span>
                Pick
              </button>
              <button
                class="button is-info is-medium"
                @click="saveCustomCompanionToStore"
                :disabled="isCompanionAlreadySaved(customCompanion)"
              >
                <span class="material-symbols-outlined mr-2">save</span>
                {{
                  isCompanionAlreadySaved(customCompanion)
                    ? "Saved"
                    : "Save Character"
                }}
              </button>
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
            Roleplay Sessions with <span class="has-text-brand"> {{ selectedCompanion.name }}</span>
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
        <h3
          class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4"
        >
          <span class="material-symbols-outlined mr-2 is-size-1">
            landscape
          </span>
          Select Scenario
        </h3>
        <hr />
        <div class="scenario-grid">
          <div
            v-for="scenario in predefinedScenarios"
            :key="scenario.id"
            class="scenario-card"
            :class="{ 'is-selected': selectedScenario?.id === scenario.id }"
            @click="selectScenario(scenario)"
          >
            <h4 class="scenario-name fira-sans-condensed-black-italic">
              {{ scenario.name }}
            </h4>
            <hr />
            <p class="scenario-desc" style="min-height: 50px">
              {{ scenario.description }}
            </p>
            <hr />
            <p
              class="has-text-white mt-5 is-size-7"
              style="text-transform: uppercase; word-wrap: break-word"
            >
              {{ scenario.mood }}
            </p>
          </div>

          <!-- Custom Scenario Card -->
          <div
            class="scenario-card is-custom has-text-left"
            :class="{ 'is-selected': selectedScenario?.isCustom }"
            @click="openCustomScenario"
          >
            <h4
              class="scenario-name fira-sans-condensed-black-italic is-size-4"
            >
              <span class="material-symbols-outlined mr-1">add</span>
              Custom
            </h4>
            <p class="scenario-desc">Create your own scenario</p>
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
              @click="showCustomScenario = false"
            >
              Cancel
            </button>
          </div>

          <div
            v-if="customScenario"
            class="custom-scenario-preview mt-4 p-6 has-text-left"
          >
            <h5
              class="fira-sans-condensed-black-italic has-text-success is-size-4"
            >
              {{ customScenario.name }}
            </h5>
            <p class="is-size-6 has-text-grey-light mt-2">
              {{ customScenario.setting.environment }}
              {{ customScenario.setting.atmosphere }}
            </p>
            <button
              class="button is-success is-medium mt-5"
              @click="useCustomScenario"
            >
              <span class="material-symbols-outlined mr-1">check</span>
              Pick
            </button>
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
      </div>

      <!-- Dynamic Download Requirements -->
      <div class="model-requirements mt-4">
        <!-- Missing Models (Red) -->
        <div
          v-if="missingModels.length > 0"
          class="notification is-danger is-light mb-3"
        >
          <p class="has-text-weight-bold mb-2">
            <span
              class="material-symbols-outlined mr-1"
              style="vertical-align: middle"
            >
              download
            </span>
            Download Required
          </p>
          <div class="requirements-list">
            <ul
              v-for="modelKey in missingModels"
              :key="modelKey"
              class="requirement-item is-missing"
            >
              <span class="material-symbols-outlined" style="font-size: 16px">
                cancel
              </span>
              <span class="model-name">{{ getModelInfo(modelKey).name }}</span>
              <span class="tag is-small is-dark ml-2">
                {{ getModelInfo(modelKey).size }}
              </span>
              <span class="tag is-small is-danger ml-1">
                {{ getModelInfo(modelKey).type }}
              </span>
            </ul>
          </div>
        </div>
      </div>

      <!-- Start Button -->
      <div class="control has-text-center">
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
          <div class="column is-narrow">
            <!-- Autonomous Mode Toggle -->
            <label
              class="checkbox autonomous-toggle mr-3"
              :class="{ active: autonomousModeDisplay }"
            >
              <input
                type="checkbox"
                :checked="autonomousModeDisplay"
                @change="toggleAutonomousMode($event.target.checked)"
              />
              <span
                class="material-symbols-outlined mr-1"
                style="font-size: 16px"
              >
                {{ autonomousModeDisplay ? "self_improvement" : "person_off" }}
              </span>
              <span class="is-size-7">{{ autonomousPending ? "Starting..." : "Auto" }}</span>
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
            <span class="material-symbols-outlined mr-2" @click="clearMissedMessages">cancel</span>
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
        <!-- Background layer with fade-in transition -->
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
          <div class="message-avatar">
            <span class="material-symbols-outlined">
              {{
                msg.role === "user"
                  ? "person"
                  : getAvatarIcon(
                      selectedCompanion?.avatar,
                      selectedCompanion?.gender,
                    )
              }}
            </span>
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
                  *{{ selectedCompanion?.name || 'Companion' }} pauses thoughtfully*
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
          <div class="message-avatar">
            <span class="material-symbols-outlined">
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
          style="box-shadow: none;"
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
      <div class="chat-input">
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
              <span class="material-symbols-outlined">add_photo_alternate</span>
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
              :placeholder="
                isProcessingMessage
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
              :disabled="!userMessage.trim() && !uploadedImage"
              :class="{ 'is-loading': isProcessingMessage && pendingMessage }"
              style="box-shadow: none"
              :title="
                isProcessingMessage ? 'Message will be queued' : 'Send message'
              "
            >
              <span
                v-if="!(isProcessingMessage && pendingMessage)"
                class="material-symbols-outlined"
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
  PREDEFINED_COMPANIONS,
  PREDEFINED_SCENARIOS,
  CONTENT_LEVELS,
  MODEL_REQUIREMENTS,
  roleplayCompanion,
  clearAllMemory,
} from "../../skills/flagship.js";
import { useSkillStore } from "../../stores/skillStore.js";

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

    const settings = ref({
      contentLevel: "pg13",
      // Media options as individual checkboxes
      enableImage: true,
      enableAudio: false,
      enableVideo: false,
      enableVision: false,
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

    // Required LLM for roleplay
    const REQUIRED_LLM = "llm_mythomax";
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
    const autonomousModeDisplay = computed(() => autonomousMode.value || autonomousPending.value);
    const missedMessages = computed(() => skillStore.missedMessages);

    // Scene state for smart image generation and anti-repetition
    const sceneState = ref({
      lastImageAt: -3, // Message index of last image (-3 to allow first message to have image)
      currentLocation: "", // Current location/setting
      recentEmotions: [], // Last few emotions (for variety)
      recentActions: [], // Last few actions (for variety)
      lastOpeningPhrase: "", // Last response opening (avoid repetition)
    });

    // Session persistence
    const STORAGE_KEY = "roleplaySessions";
    const savedSessions = ref({});
    const showSessionManager = ref(false); // Show session manager overlay

    // Custom companions persistence
    const CUSTOM_COMPANIONS_KEY = "roleplayCustomCompanions";
    const savedCustomCompanions = ref([]);

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
      if (!key || chatHistory.value.length === 0) {
        console.log("[Roleplay] Skip save: no key or empty history");
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
    const loadSession = (key) => {
      const session = savedSessions.value[key];
      if (!session) return false;

      selectedCompanion.value = session.companion;
      selectedScenario.value = session.scenario;

      // Handle both old (responseMode string) and new (checkbox) settings formats
      const savedSettings = session.settings || {};
      console.log(`[Roleplay] Restoring session settings:`, savedSettings);

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
        };
      } else if (savedSettings.enableImage !== undefined) {
        // New format: use checkbox settings directly
        settings.value = { ...savedSettings };
      } else {
        // Fallback defaults
        settings.value = {
          contentLevel: savedSettings.contentLevel || "pg13",
          enableImage: true,
          enableAudio: false,
          enableVideo: false,
          enableVision: false,
        };
      }

      console.log(`[Roleplay] Restored contentLevel: ${settings.value.contentLevel}`);

      chatHistory.value = session.history || [];

      // Restore scene state if available
      if (session.sceneState) {
        sceneState.value = { ...session.sceneState };
      } else {
        rebuildSceneState();
      }

      // Restore scenario background image if available
      scenarioBackgroundImage.value = session.backgroundImage || null;

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
    // CUSTOM COMPANIONS PERSISTENCE
    // ═══════════════════════════════════════════════════════════════════════════

    // Load saved custom companions from storage
    const loadCustomCompanions = async () => {
      try {
        if (window.electronAPI?.store?.get) {
          const stored = await window.electronAPI.store.get(
            CUSTOM_COMPANIONS_KEY,
            [],
          );
          savedCustomCompanions.value = stored || [];
          console.log(
            `[Roleplay] Loaded ${savedCustomCompanions.value.length} custom companions`,
          );
        } else {
          console.warn(
            "[Roleplay] Electron store API not available - no custom companions loaded",
          );
          savedCustomCompanions.value = [];
        }
      } catch (e) {
        console.error("[Roleplay] Failed to load custom companions:", e);
        savedCustomCompanions.value = [];
      }
    };

    // Save a custom companion to the store
    const saveCustomCompanionToStore = async () => {
      if (!customCompanion.value) return;

      // Generate a unique ID if not present
      const companionToSave = {
        ...JSON.parse(JSON.stringify(toRaw(customCompanion.value))),
        id: customCompanion.value.id || `custom_${Date.now()}`,
        isCustom: true,
        createdAt: Date.now(),
      };

      // Check if already saved (by name)
      const existingIdx = savedCustomCompanions.value.findIndex(
        (c) => c.name.toLowerCase() === companionToSave.name.toLowerCase(),
      );

      if (existingIdx >= 0) {
        // Update existing
        savedCustomCompanions.value[existingIdx] = companionToSave;
      } else {
        // Add new
        savedCustomCompanions.value.push(companionToSave);
      }

      try {
        if (window.electronAPI?.store?.set) {
          const plainCompanions = JSON.parse(
            JSON.stringify(toRaw(savedCustomCompanions.value)),
          );
          await window.electronAPI.store.set(
            CUSTOM_COMPANIONS_KEY,
            plainCompanions,
          );
          console.log(
            `[Roleplay] Custom companion saved: ${companionToSave.name}`,
          );
        }
      } catch (e) {
        console.error("[Roleplay] Failed to save custom companion:", e);
      }
    };

    // Delete a custom companion
    const deleteCustomCompanion = async (companionId) => {
      if (!companionId) return;

      const idx = savedCustomCompanions.value.findIndex(
        (c) => c.id === companionId,
      );
      if (idx < 0) return;

      const companionName = savedCustomCompanions.value[idx].name;
      savedCustomCompanions.value.splice(idx, 1);

      try {
        if (window.electronAPI?.store?.set) {
          const plainCompanions = JSON.parse(
            JSON.stringify(toRaw(savedCustomCompanions.value)),
          );
          await window.electronAPI.store.set(
            CUSTOM_COMPANIONS_KEY,
            plainCompanions,
          );
          console.log(`[Roleplay] Custom companion deleted: ${companionName}`);
        }
      } catch (e) {
        console.error("[Roleplay] Failed to delete custom companion:", e);
      }

      // If this companion was selected, deselect it
      if (selectedCompanion.value?.id === companionId) {
        selectedCompanion.value = null;
      }
    };

    // Check if a companion is already saved
    const isCompanionAlreadySaved = (companion) => {
      if (!companion) return false;
      return savedCustomCompanions.value.some(
        (c) => c.name.toLowerCase() === companion.name.toLowerCase(),
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

        // Wait for current generation to finish before starting autonomous mode
        if (isProcessingMessage.value || isTyping.value) {
          console.log("[Roleplay] Waiting for current generation to finish before enabling autonomous mode...");
          // Poll until generation is complete
          await new Promise((resolve) => {
            const checkInterval = setInterval(() => {
              if (!isProcessingMessage.value && !isTyping.value) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 500);
          });
          console.log("[Roleplay] Current generation finished, now enabling autonomous mode");
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

    /**
     * Sync history with the store after user sends a message
     * This keeps the store in sync when user is actively chatting
     */
    const syncHistoryWithStore = () => {
      if (
        skillStore.autonomousMode &&
        skillStore.autonomousSession.sessionKey === currentSessionKey.value
      ) {
        skillStore.syncAutonomousHistory(chatHistory.value, sceneState.value);
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

          // Also import custom companions if present
          if (
            importedData.customCompanions &&
            Array.isArray(importedData.customCompanions)
          ) {
            for (const companion of importedData.customCompanions) {
              const existingIdx = savedCustomCompanions.value.findIndex(
                (c) => c.name.toLowerCase() === companion.name.toLowerCase(),
              );
              if (existingIdx < 0) {
                savedCustomCompanions.value.push(companion);
              }
            }
          }

          // Save to store
          if (window.electronAPI?.store?.set) {
            const plainSessions = JSON.parse(
              JSON.stringify(toRaw(savedSessions.value)),
            );
            await window.electronAPI.store.set(STORAGE_KEY, plainSessions);

            const plainCompanions = JSON.parse(
              JSON.stringify(toRaw(savedCustomCompanions.value)),
            );
            await window.electronAPI.store.set(
              CUSTOM_COMPANIONS_KEY,
              plainCompanions,
            );
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
        customCompanions: JSON.parse(
          JSON.stringify(toRaw(savedCustomCompanions.value)),
        ),
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

    // Data
    const predefinedCompanions = PREDEFINED_COMPANIONS;
    const predefinedScenarios = PREDEFINED_SCENARIOS;
    const contentLevels = CONTENT_LEVELS;

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

    // Handle scroll to update visible background (debounced)
    let scrollTimeout = null;
    const onMessagesScroll = (event) => {
      // Debounce scroll handler to prevent excessive updates
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const container = event.target;
        const messages = container.querySelectorAll(".chat-message");
        if (!messages.length) return;

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
          // Update background if needed
          const bgForIndex = getBackgroundForIndex(closestIndex);
          if (bgForIndex && bgForIndex !== scenarioBackgroundImage.value) {
            scenarioBackgroundImage.value = bgForIndex;
          }
        }
      }, 100); // 100ms debounce
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

    const selectCompanion = (companion) => {
      selectedCompanion.value = companion;
      showCustomCompanion.value = false;
      // Sessions are now shown via companionSessions computed property
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

    const generateCustomCompanion = async () => {
      if (!customCompanionPrompt.value || isGenerating.value) return;
      isGenerating.value = true;

      try {
        const result = await roleplayCompanion.execution.generateCompanion(
          {
            description: customCompanionPrompt.value,
            style: customCompanionStyle.value,
          },
          { updateStatus: (s) => console.log("[Roleplay]", s) },
        );
        customCompanion.value = result;
      } catch (e) {
        console.error("[Roleplay] Failed to generate companion:", e);
      } finally {
        isGenerating.value = false;
      }
    };

    const useCustomCompanion = () => {
      if (customCompanion.value) {
        selectedCompanion.value = customCompanion.value;
        showCustomCompanion.value = false;
      }
    };

    const generateCustomScenario = async () => {
      if (!customScenarioPrompt.value || isGenerating.value) return;
      isGenerating.value = true;

      try {
        const result = await roleplayCompanion.execution.generateScenario(
          { description: customScenarioPrompt.value, mood: "romantic" },
          { updateStatus: (s) => console.log("[Roleplay]", s) },
        );
        customScenario.value = result;
      } catch (e) {
        console.error("[Roleplay] Failed to generate scenario:", e);
      } finally {
        isGenerating.value = false;
      }
    };

    const useCustomScenario = () => {
      if (customScenario.value) {
        selectedScenario.value = customScenario.value;
        showCustomScenario.value = false;
      }
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
          }

          // Update scene state from init
          if (result.sceneState) {
            sceneState.value = { ...result.sceneState };
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
          }

          if (result.sceneState) {
            sceneState.value = { ...result.sceneState };
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
        console.log('[RoleplayChat] All memory cleared on chat end');
      } catch (e) {
        console.warn('[RoleplayChat] Failed to clear memory:', e);
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
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedCompanion.value?.name || 'companion'}_${idx}_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('[RoleplayChat] Failed to download image:', e);
      }
    };

    // Send image to GenerativeVideo for image-to-video generation
    const sendToVideoGenerator = async (image) => {
      try {
        const imageSrc = getImageSrc(image);
        // Store the image in sessionStorage for GenerativeVideo to pick up
        if (image.startsWith('data:')) {
          sessionStorage.setItem('pendingI2VImage', image);
        } else {
          // Fetch and convert to base64
          const response = await fetch(imageSrc);
          const blob = await response.blob();
          const reader = new FileReader();
          reader.onload = () => {
            sessionStorage.setItem('pendingI2VImage', reader.result);
            // Navigate to GenerativeVideo tab
            window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab: 'video' } }));
          };
          reader.readAsDataURL(blob);
          return;
        }
        // Navigate to GenerativeVideo tab
        window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab: 'video' } }));
      } catch (e) {
        console.error('[RoleplayChat] Failed to send image to video generator:', e);
      }
    };

    // Delete specific media type from a message (or the whole message if only text)
    const deleteMessageMedia = async (messageIdx, mediaType) => {
      const msg = chatHistory.value[messageIdx];
      if (!msg) return;

      if (mediaType === 'text') {
        // If message only has text (no media), remove the entire message
        const hasMedia = msg.image || msg.audio || msg.video;
        if (!hasMedia) {
          chatHistory.value.splice(messageIdx, 1);
          console.log(`[RoleplayChat] Deleted entire message at index ${messageIdx}`);
        } else {
          // Clear just the text content and action
          msg.content = '';
          msg.action = '';
          console.log(`[RoleplayChat] Cleared text from message at index ${messageIdx}`);
        }
      } else if (mediaType === 'image') {
        delete msg.image;
        console.log(`[RoleplayChat] Deleted image from message at index ${messageIdx}`);
      } else if (mediaType === 'audio') {
        delete msg.audio;
        console.log(`[RoleplayChat] Deleted audio from message at index ${messageIdx}`);
      } else if (mediaType === 'video') {
        delete msg.video;
        console.log(`[RoleplayChat] Deleted video from message at index ${messageIdx}`);
      }

      // Check if message is now empty (no content and no media)
      const updatedMsg = chatHistory.value[messageIdx];
      if (updatedMsg && !updatedMsg.content && !updatedMsg.image && !updatedMsg.audio && !updatedMsg.video) {
        chatHistory.value.splice(messageIdx, 1);
        console.log(`[RoleplayChat] Removed empty message at index ${messageIdx}`);
      }

      // Save updated session
      await saveSession();
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
            sceneState: sceneState.value,
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
                console.log(`[RoleplayChat] Text progress received, content length: ${responseText?.length || 0}, preview: "${responseText?.substring(0, 50) || 'EMPTY'}"`);
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
            console.log(`[RoleplayChat] Final update, content length: ${finalContent?.length || 0}, preview: "${finalContent?.substring(0, 50) || 'EMPTY'}"`);
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

    // Load sessions, custom companions, and check model availability on mount
    onMounted(async () => {
      await Promise.all([
        loadSessions(),
        loadCustomCompanions(),
        checkModelAvailability(),
      ]);

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

          // Find matching companion - check predefined first, then custom companions
          let companion = predefinedCompanions.find(
            (c) => c.id === companionId,
          );
          let companionSource = companion ? "predefined" : null;

          if (!companion) {
            // Try savedCustomCompanions by ID or name-based ID
            companion = savedCustomCompanions.value.find(
              (c) =>
                c.id === companionId ||
                `custom_${c.name?.toLowerCase().replace(/\s+/g, "_")}` ===
                  companionId,
            );
            if (companion) companionSource = "savedCustom";
          }

          if (!companion) {
            // Fallback: Try getting companion directly from the store session
            const storeCompanion = skillStore.autonomousSession?.companion;
            if (storeCompanion) {
              const storeCompanionId =
                storeCompanion.id ||
                `custom_${storeCompanion.name?.toLowerCase().replace(/\s+/g, "_")}`;
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
          let scenario = predefinedScenarios.find((s) => s.id === scenarioId);
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
      // Just sync the current state to store if autonomous mode is active
      if (skillStore.autonomousMode && phase.value === "chat") {
        skillStore.syncAutonomousHistory(chatHistory.value, sceneState.value);
        // Autonomous mode continues running - companion keeps generating messages
      } else {
        // Clear ALL memory when leaving the skill (if not in autonomous mode)
        clearAllMemory()
          .then(() => console.log('[RoleplayChat] All memory cleared on unmount'))
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
      predefinedCompanions,
      predefinedScenarios,
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
      // Custom companions persistence
      savedCustomCompanions,
      saveCustomCompanionToStore,
      deleteCustomCompanion,
      isCompanionAlreadySaved,
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

/* Setup Phase */
.companion-grid,
.scenario-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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

.companion-avatar {
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.75rem;
}

.companion-avatar .material-symbols-outlined {
  font-size: 28px;
  color: #fff;
}

.companion-avatar {
  position: relative;
  position: absolute;
  top: -24px;
  right: -24px;
}

.session-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: rgba(57, 213, 130, 0.5);
  color: #fff;
  font-size: 10px;
  font-weight: bold;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.companion-card.has-session {
  /* border-color: rgba(57, 213, 130, 0.5) !important; */
  box-shadow: 0 8px 24px rgba(57, 213, 130, 0.2);
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

.custom-badge {
  position: absolute;
  bottom: -3px;
  right: -3px;
  background: rgba(50, 115, 220, 0.9);
  color: #fff;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.delete-custom-btn {
  position: absolute;
  top: -24px;
  right: -24px;
  background: rgba(255, 56, 96, 1);
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

.companion-card.is-saved-custom:hover .delete-custom-btn {
  opacity: 1;
}

.delete-custom-btn:hover {
  background: rgba(255, 56, 96, 1);
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
  transition: opacity 0.2s ease, background 0.2s ease;
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
  border-bottom: 2px solid rgba(0,0,0,0.3) !important;
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
