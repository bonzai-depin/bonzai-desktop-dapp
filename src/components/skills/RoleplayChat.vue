<template>
  <div class="roleplay-chat">
    <!-- Setup Phase -->
    <div v-if="phase === 'setup'" class="setup-phase">
      <!-- Companion Selection -->
      <div class="models__activity--payouts mb-5">
        <h3
          class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4"
        >
          Select Companion
        </h3>

        <!-- Predefined Companions -->
        <div class="companion-grid">
          <div
            v-for="companion in predefinedCompanions"
            :key="companion.id"
            class="companion-card"
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
              <h4 class="companion-name fira-sans-condensed-black-italic">
                {{ companion.name }}
              </h4>
              <p class="companion-desc">{{ companion.description }}</p>
            </div>
          </div>

          <!-- Saved Custom Companions -->
          <div
            v-for="companion in savedCustomCompanions"
            :key="companion.id"
            class="companion-card is-saved-custom"
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
                <span class="material-symbols-outlined" style="font-size: 10px">auto_awesome</span>
              </span>
            </div>
            <div class="companion-info">
              <h4 class="companion-name fira-sans-condensed-black-italic">
                {{ companion.name }}
              </h4>
              <p class="companion-desc">{{ companion.description }}</p>
            </div>
            <!-- Delete button -->
            <button
              class="delete-custom-btn"
              @click.stop="deleteCustomCompanion(companion.id)"
              title="Delete character"
            >
              <span class="material-symbols-outlined" style="font-size: 14px">close</span>
            </button>
          </div>

          <!-- Custom Companion Card -->
          <div
            class="companion-card is-custom"
            :class="{ 'is-selected': selectedCompanion?.isCustom }"
            @click="openCustomCompanion"
          >
            <div class="companion-avatar">
              <span class="material-symbols-outlined">add</span>
            </div>
            <div class="companion-info">
              <h4 class="companion-name fira-sans-condensed-black-italic">
                Create Custom
              </h4>
              <p class="companion-desc">Design your own companion</p>
            </div>
          </div>
        </div>

        <!-- Custom Companion Generator -->
        <div v-if="showCustomCompanion" class="custom-companion-form mt-5 p-4">
          <h4 class="fira-sans-condensed-black-italic has-text-white mb-3">
            <span class="material-symbols-outlined mr-2">auto_awesome</span>
            Generate Custom Companion
          </h4>
          <div class="field">
            <div class="control">
              <textarea
                v-model="customCompanionPrompt"
                class="textarea"
                placeholder="Describe your ideal companion (e.g., 'A mysterious vampire prince with a brooding personality')"
                rows="2"
              ></textarea>
            </div>
          </div>
          <div class="field">
            <label class="label has-text-white is-size-7">Style</label>
            <div class="control">
              <div class="select is-small">
                <select v-model="customCompanionStyle">
                  <option value="romantic">Romantic</option>
                  <option value="adventurous">Adventurous</option>
                  <option value="mysterious">Mysterious</option>
                  <option value="wholesome">Wholesome</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
          </div>
          <div class="buttons mt-3">
            <button
              class="button is-info"
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
            <button class="button" @click="showCustomCompanion = false">
              Cancel
            </button>
          </div>

          <pre>{{  customCompanion }}</pre>
          <!-- Generated Custom Companion Preview -->
          <div v-if="customCompanion" class="custom-companion-preview mt-4 p-3">
            <h5 class="fira-sans-condensed-black-italic has-text-success">
              {{ customCompanion.name }}
            </h5>
            <p class="is-size-7 has-text-grey-light">
              {{ customCompanion.description }}
            </p>
            <div class="tags mt-2">
              <span class="tag is-dark is-small">
                {{ customCompanion.personality }}
              </span>
            </div>
            <div class="buttons mt-2">
              <button
                class="button is-success is-small"
                @click="useCustomCompanion"
              >
                <span
                  class="material-symbols-outlined mr-1"
                  style="font-size: 14px"
                >
                  check
                </span>
                Use This Companion
              </button>
              <button
                class="button is-info is-small"
                @click="saveCustomCompanionToStore"
                :disabled="isCompanionAlreadySaved(customCompanion)"
              >
                <span
                  class="material-symbols-outlined mr-1"
                  style="font-size: 14px"
                >
                  save
                </span>
                {{ isCompanionAlreadySaved(customCompanion) ? 'Saved' : 'Save Character' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Scenario Selection -->
      <div class="models__activity--payouts mb-5">
        <h3
          class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4"
        >
          <span class="material-symbols-outlined mr-2 is-size-1">
            landscape
          </span>
          Choose Scenario
        </h3>

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
            <p class="scenario-desc">{{ scenario.description }}</p>
            <span class="tag is-dark is-small">{{ scenario.mood }}</span>
          </div>

          <!-- Custom Scenario Card -->
          <div
            class="scenario-card is-custom"
            :class="{ 'is-selected': selectedScenario?.isCustom }"
            @click="openCustomScenario"
          >
            <h4 class="scenario-name fira-sans-condensed-black-italic">
              <span class="material-symbols-outlined mr-1">add</span>
              Custom
            </h4>
            <p class="scenario-desc">Create your own scenario</p>
          </div>
        </div>

        <!-- Custom Scenario Generator -->
        <div v-if="showCustomScenario" class="custom-scenario-form mt-5 p-4">
          <h4 class="fira-sans-condensed-black-italic has-text-white mb-3">
            <span class="material-symbols-outlined mr-2">auto_awesome</span>
            Generate Custom Scenario
          </h4>
          <div class="field">
            <div class="control">
              <textarea
                v-model="customScenarioPrompt"
                class="textarea"
                placeholder="Describe the scenario (e.g., 'A rainy night in a cozy bookshop')"
                rows="2"
              ></textarea>
            </div>
          </div>
          <div class="buttons mt-3">
            <button
              class="button is-info"
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
            <button class="button" @click="showCustomScenario = false">
              Cancel
            </button>
          </div>

          <div v-if="customScenario" class="custom-scenario-preview mt-4 p-3">
            <h5 class="fira-sans-condensed-black-italic has-text-success">
              {{ customScenario.name }}
            </h5>
            <p class="is-size-7 has-text-grey-light">
              {{ customScenario.setting }}
            </p>
            <button
              class="button is-success is-small mt-2"
              @click="useCustomScenario"
            >
              <span
                class="material-symbols-outlined mr-1"
                style="font-size: 14px"
              >
                check
              </span>
              Use This Scenario
            </button>
          </div>
        </div>
      </div>

      <!-- Settings -->
      <div class="models__activity--payouts mb-5">
        <h3
          class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4"
        >
          <span class="material-symbols-outlined mr-2 is-size-1">settings</span>
          Settings
        </h3>

        <div class="columns">
          <div class="column is-6">
            <div class="field">
              <label
                class="label has-text-white fira-sans-condensed-black-italic"
              >
                Content Level
              </label>
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
            <div class="field">
              <label
                class="label has-text-white fira-sans-condensed-black-italic"
              >
                Media Options
              </label>
              <div class="media-checkboxes">
                <label
                  class="checkbox media-option"
                  :class="{
                    'is-unavailable': !isModelAvailable('image_turbo'),
                  }"
                >
                  <input
                    type="checkbox"
                    v-model="settings.enableImage"
                    :disabled="!isModelAvailable('image_turbo')"
                  />
                  <span class="material-symbols-outlined">image</span>
                  <span>Image</span>
                  <span
                    v-if="!isModelAvailable('image_turbo')"
                    class="tag is-small is-warning ml-1"
                  >
                    Download
                  </span>
                </label>
                <label
                  class="checkbox media-option"
                  :class="{
                    'is-unavailable': !isModelAvailable('audio_quality'),
                  }"
                >
                  <input
                    type="checkbox"
                    v-model="settings.enableAudio"
                    :disabled="!isModelAvailable('audio_quality')"
                  />
                  <span class="material-symbols-outlined">volume_up</span>
                  <span>Voice</span>
                  <span
                    v-if="!isModelAvailable('audio_quality')"
                    class="tag is-small is-warning ml-1"
                  >
                    Download
                  </span>
                </label>
                <label
                  class="checkbox media-option"
                  :class="{ 'is-unavailable': !isModelAvailable('video_fast') }"
                >
                  <input
                    type="checkbox"
                    v-model="settings.enableVideo"
                    :disabled="!isModelAvailable('video_fast')"
                  />
                  <span class="material-symbols-outlined">movie</span>
                  <span>Video</span>
                  <span
                    v-if="!isModelAvailable('video_fast')"
                    class="tag is-small is-warning ml-1"
                  >
                    Download
                  </span>
                </label>
                <label
                  class="checkbox media-option"
                  :class="{ 'is-unavailable': !isModelAvailable('vision') }"
                >
                  <input
                    type="checkbox"
                    v-model="settings.enableVision"
                    :disabled="!isModelAvailable('vision')"
                  />
                  <span class="material-symbols-outlined">visibility</span>
                  <span>Vision</span>
                  <span
                    v-if="!isModelAvailable('vision')"
                    class="tag is-small is-warning ml-1"
                  >
                    Download
                  </span>
                </label>
              </div>
              <p class="help has-text-grey-light mt-2">
                Video generates on peak emotions. Vision allows image uploads.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Saved Sessions for Selected Companion -->
      <div
        v-if="selectedCompanion && companionSessions.length > 0"
        class="models__activity--payouts mb-5"
      >
        <h3
          class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4"
        >
          <span class="material-symbols-outlined mr-2 is-size-1">history</span>
          Saved Sessions with {{ selectedCompanion.name }}
        </h3>
        <div class="saved-sessions-list">
          <div
            v-for="session in companionSessions"
            :key="session.key"
            class="saved-session-card"
          >
            <div class="session-info">
              <div class="session-header">
                <span class="scenario-name fira-sans-condensed-black-italic">
                  {{ session.scenario?.name || "Unknown Scenario" }}
                </span>
                <span class="tag is-small is-info ml-2">
                  {{ session.messageCount }} msgs
                </span>
              </div>
              <p class="session-meta is-size-7 has-text-grey-light">
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
                class="button is-info is-small"
                @click="resumeSession(session.key)"
              >
                <span
                  class="material-symbols-outlined mr-1"
                  style="font-size: 14px"
                >
                  play_arrow
                </span>
                Resume
              </button>
              <button
                class="button is-warning is-small is-outlined"
                @click="exportSession(session.key)"
                title="Export session"
              >
                <span class="material-symbols-outlined" style="font-size: 14px">
                  download
                </span>
              </button>
              <button
                class="button is-danger is-small is-outlined"
                @click="deleteSession(session.key)"
              >
                <span class="material-symbols-outlined" style="font-size: 14px">
                  delete
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Import/Export Sessions -->
      <div class="models__activity--payouts mb-5">
        <h3
          class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4"
        >
          <span class="material-symbols-outlined mr-2 is-size-1">folder</span>
          Import / Export Sessions
        </h3>
        <div class="buttons">
          <button class="button is-info" @click="triggerImportSession">
            <span class="material-symbols-outlined mr-1">upload</span>
            Import Session
          </button>
          <button
            class="button is-warning"
            @click="exportAllSessions"
            :disabled="Object.keys(savedSessions).length === 0"
          >
            <span class="material-symbols-outlined mr-1">download</span>
            Export All Sessions
          </button>
        </div>
        <input
          ref="importInput"
          type="file"
          accept=".json"
          style="display: none"
          @change="handleImportSession"
        />
        <p class="help has-text-grey-light">
          Export your chat sessions to backup or share, or import previously exported sessions.
        </p>
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
                {{ getAvatarIcon(selectedCompanion?.avatar, selectedCompanion?.gender) }}
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
            <div class="tags">
              <span class="tag is-info is-medium">
                {{ contentLevels[settings.contentLevel]?.label }}
              </span>
              <span class="tag is-dark is-medium">
                {{ formatResponseMode(responseMode) }}
              </span>
            </div>
          </div>
          <div class="column is-narrow">
            <!-- Autonomous Mode Toggle -->
            <label class="checkbox autonomous-toggle mr-3" :class="{ active: autonomousMode }">
              <input type="checkbox" :checked="autonomousMode" @change="toggleAutonomousMode($event.target.checked)">
              <span class="material-symbols-outlined mr-1" style="font-size: 16px">
                {{ autonomousMode ? 'self_improvement' : 'person_off' }}
              </span>
              <span class="is-size-7">Auto</span>
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
      <div v-if="missedMessages > 0" class="missed-messages-banner notification is-info is-light mb-3">
        <div class="level is-mobile">
          <div class="level-left">
            <span class="material-symbols-outlined mr-2">notifications</span>
            <span class="fira-sans-condensed-black-italic">
              {{ missedMessages }} message{{ missedMessages > 1 ? 's' : '' }} while you were away
            </span>
          </div>
          <div class="level-right">
            <button class="button is-small is-info" @click="clearMissedMessages">
              Dismiss
            </button>
          </div>
        </div>
      </div>

      <!-- Chat Messages -->
      <div class="chat-messages" ref="messagesContainer">
        <!-- Initial Scene Description with Generated Image -->
        <div v-if="selectedScenario" class="scene-description mb-4">
          <div class="notification is-dark scene-backdrop" :style="scenarioBackgroundStyle">
            <div class="scene-overlay">
              <p class="is-italic">{{ selectedScenario.setting }}</p>
            </div>
          </div>
        </div>

        <!-- Messages -->
        <div
          v-for="(msg, idx) in chatHistory"
          :key="idx"
          class="chat-message"
          :class="msg.role"
        >
          <div class="message-avatar">
            <span class="material-symbols-outlined">
              {{
                msg.role === "user"
                  ? "person"
                  : getAvatarIcon(selectedCompanion?.avatar, selectedCompanion?.gender)
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
              <div v-if="msg.isGenerating && !msg.content" class="typing-placeholder">
                <div class="typing-indicator inline">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <p v-if="typingStatus" class="typing-status is-size-7 has-text-grey-light mt-2">
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
                <p>{{ msg.content }}</p>
              </template>
            </div>

            <!-- Image -->
            <div v-if="msg.image" class="message-image mt-3">
              <img :src="getImageSrc(msg.image)" alt="Scene" />
            </div>

            <!-- Audio -->
            <div v-if="msg.audio" class="message-audio mt-3">
              <audio controls :src="getAudioSrc(msg.audio)"></audio>
            </div>

            <!-- Video (for peak emotion scenes) -->
            <div v-if="msg.video" class="message-video mt-3">
              <video
                controls
                :src="getVideoSrc(msg.video)"
                :poster="msg.image ? getImageSrc(msg.image) : undefined"
              ></video>
            </div>
          </div>
        </div>

        <!-- Typing Indicator - only show if no message is currently being generated inline -->
        <div v-if="isTyping && !chatHistory.some(m => m.isGenerating)" class="chat-message assistant typing">
          <div class="message-avatar">
            <span class="material-symbols-outlined">
              {{ getAvatarIcon(selectedCompanion?.avatar, selectedCompanion?.gender) }}
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

      <!-- Suggested Responses -->
      <div
        v-if="suggestedResponses.length > 0 && !isTyping"
        class="suggested-responses mb-3"
      >
        <button
          v-for="(suggestion, idx) in suggestedResponses"
          :key="idx"
          class="button is-small is-info is-outlined m-5"
          @click="sendMessage(suggestion)"
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
              class="button is-medium is-outlined"
              @click="triggerImageUpload"
              :disabled="isTyping || isAnalyzingImage"
              :class="{ 'is-info': uploadedImage }"
              title="Upload an image for vision analysis"
              style="box-shadow: none;"
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
              class="input is-medium"
              type="text"
              :placeholder="
                uploadedImage
                  ? `Describe what you see or ask about the image...`
                  : `What do you say to ${selectedCompanion?.name}?`
              "
              @keyup.enter="sendMessage()"
              :disabled="isTyping"
            />
          </div>
          <div class="control">
            <button
              class="button is-success is-medium"
              @click="sendMessage()"
              :disabled="(!userMessage.trim() && !uploadedImage) || isTyping"
              style="box-shadow: none;"
            >
              <span class="material-symbols-outlined">send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, reactive, nextTick, onMounted, onUnmounted, toRaw, watch } from "vue";
import {
  PREDEFINED_COMPANIONS,
  PREDEFINED_SCENARIOS,
  CONTENT_LEVELS,
  MODEL_REQUIREMENTS,
  roleplayCompanion,
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
    const isInitializingSession = ref(false);

    // Autonomous companion mode - uses global store (skillStore)
    // Local computed refs for template convenience
    const autonomousMode = computed(() => skillStore.autonomousMode);
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
          const stored = await window.electronAPI.store.get(CUSTOM_COMPANIONS_KEY, []);
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
          await window.electronAPI.store.set(CUSTOM_COMPANIONS_KEY, plainCompanions);
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

      const idx = savedCustomCompanions.value.findIndex((c) => c.id === companionId);
      if (idx < 0) return;

      const companionName = savedCustomCompanions.value[idx].name;
      savedCustomCompanions.value.splice(idx, 1);

      try {
        if (window.electronAPI?.store?.set) {
          const plainCompanions = JSON.parse(
            JSON.stringify(toRaw(savedCustomCompanions.value)),
          );
          await window.electronAPI.store.set(CUSTOM_COMPANIONS_KEY, plainCompanions);
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
     */
    const toggleAutonomousMode = (enabled) => {
      if (enabled) {
        console.log('[Roleplay] Enabling autonomous mode with session:', {
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
        });
        skillStore.toggleAutonomousMode(true);
      } else {
        console.log('[Roleplay] Disabling autonomous mode');
        // Stop autonomous mode completely
        skillStore.stopAutonomousMode();
      }
    };

    /**
     * Sync history with the store after user sends a message
     * This keeps the store in sync when user is actively chatting
     */
    const syncHistoryWithStore = () => {
      if (skillStore.autonomousMode && skillStore.autonomousSession.sessionKey === currentSessionKey.value) {
        skillStore.syncAutonomousHistory(chatHistory.value, sceneState.value);
      }
    };

    /**
     * Sync from store - pull any messages generated while component was unmounted
     */
    const syncFromStore = () => {
      const storeData = skillStore.getAutonomousSessionData();
      if (storeData.sessionKey && storeData.sessionKey === currentSessionKey.value) {
        // Store has messages for this session - merge them
        if (storeData.history.length > chatHistory.value.length) {
          console.log(`[Roleplay] Syncing ${storeData.history.length - chatHistory.value.length} messages from store`);
          chatHistory.value = [...storeData.history];
          sceneState.value = { ...storeData.sceneState };
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
          phase.value === 'chat' &&
          skillStore.autonomousSession.sessionKey === currentSessionKey.value &&
          newLen > chatHistory.value.length
        ) {
          syncFromStore();
        }
      }
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
          if (importedData.customCompanions && Array.isArray(importedData.customCompanions)) {
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
            const plainSessions = JSON.parse(JSON.stringify(toRaw(savedSessions.value)));
            await window.electronAPI.store.set(STORAGE_KEY, plainSessions);

            const plainCompanions = JSON.parse(JSON.stringify(toRaw(savedCustomCompanions.value)));
            await window.electronAPI.store.set(CUSTOM_COMPANIONS_KEY, plainCompanions);
          }

          console.log(`[Roleplay] Imported ${importedCount} sessions`);
          alert(`Successfully imported ${importedCount} session(s)`);

        } else if (importedData.companion && importedData.scenario) {
          // Single session format
          const key = getSessionKey(
            importedData.companion,
            importedData.scenario,
            importedData.settings?.contentLevel || 'pg13',
            importedData.settings?.responseMode || 'text+image',
          );

          if (key) {
            savedSessions.value[key] = importedData;

            if (window.electronAPI?.store?.set) {
              const plainSessions = JSON.parse(JSON.stringify(toRaw(savedSessions.value)));
              await window.electronAPI.store.set(STORAGE_KEY, plainSessions);
            }

            console.log(`[Roleplay] Imported session: ${key}`);
            alert(`Successfully imported session with ${importedData.companion.name}`);
          }
        } else {
          alert('Invalid session file format');
        }
      } catch (e) {
        console.error('[Roleplay] Import failed:', e);
        alert(`Import failed: ${e.message}`);
      }

      // Reset input
      event.target.value = '';
    };

    const exportSession = (key) => {
      const session = savedSessions.value[key];
      if (!session) return;

      const exportData = {
        ...session,
        exportedAt: new Date().toISOString(),
        version: '1.0',
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roleplay-${session.companion?.name?.toLowerCase().replace(/\s+/g, '-') || 'session'}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log(`[Roleplay] Exported session: ${key}`);
    };

    const exportAllSessions = () => {
      const exportData = {
        sessions: JSON.parse(JSON.stringify(toRaw(savedSessions.value))),
        customCompanions: JSON.parse(JSON.stringify(toRaw(savedCustomCompanions.value))),
        exportedAt: new Date().toISOString(),
        version: '1.0',
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
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
    const scenarioBackgroundStyle = computed(() => {
      if (!scenarioBackgroundImage.value) return {};
      const imageSrc = getImageSrc(scenarioBackgroundImage.value);
      return {
        backgroundImage: `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.6)), url(${imageSrc})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    });

    // Methods
    const getAvatarIcon = (avatar, gender) => {
      // Robot/android companions use agender icon
      if (avatar === "android" || avatar === "smart_toy") {
        return "agender";
      }
      // Use gender-based icons for human-like companions
      if (gender === "female" || avatar === "woman") {
        return "female";
      }
      if (gender === "male" || avatar === "man" || avatar === "soldier" || avatar === "demon") {
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
      if (selectedCompanion.value && selectedScenario.value && settings.value.enableImage) {
        isInitializingSession.value = true;
        typingStatus.value = 'Setting the scene...';
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
          console.error('[Roleplay] Session init failed:', e);
        } finally {
          isInitializingSession.value = false;
          isTyping.value = false;
          typingStatus.value = '';
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
      if (selectedCompanion.value && selectedScenario.value && settings.value.enableImage) {
        isInitializingSession.value = true;
        typingStatus.value = 'Setting the scene...';
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
          console.error('[Roleplay] Session init failed:', e);
        } finally {
          isInitializingSession.value = false;
          isTyping.value = false;
          typingStatus.value = '';
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
            headers: { "Content-Type": "application/json" },
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

    const sendMessage = async (message = null) => {
      const msg = message || userMessage.value.trim();
      const hasImage = !!uploadedImage.value;

      // Need either text or image
      if ((!msg && !hasImage) || isTyping.value) return;

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

      // Add user message (include image if present)
      chatHistory.value.push({
        role: "user",
        content: messageContent,
        image: visionData?.imageDataUrl || null, // Show uploaded image in chat
      });
      userMessage.value = "";
      suggestedResponses.value = [];
      clearUploadedImage(); // Clear after capturing
      scrollToBottom();

      // No fee - chatting is free with access level

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
              if (progress.type === 'text') {
                msg.content = progress.response.response;
                msg.emotion = progress.response.emotion;
                msg.action = progress.response.action;
                msg.isGenerating = true; // Still generating media
                scrollToBottom();
              } else if (progress.type === 'image') {
                msg.image = progress.response.image;
                scrollToBottom();
              } else if (progress.type === 'audio') {
                msg.audio = progress.response.audio;
              } else if (progress.type === 'video') {
                msg.video = progress.response.video;
                scrollToBottom();
              }
            },
          },
        );

        if (result.success) {
          // Final update - ensure all content is present and remove generating flag
          const msg = chatHistory.value[assistantMessageIndex];
          if (msg) {
            msg.content = result.response.response;
            msg.emotion = result.response.emotion;
            msg.action = result.response.action;
            msg.image = result.response.image;
            msg.audio = result.response.audio;
            msg.video = result.response.video;
            msg.isGenerating = false;
          }

          // Update scene state from response
          if (result.sceneState) {
            sceneState.value = { ...result.sceneState };
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
          msg.emotion = "confused";
          msg.isGenerating = false;
        }
      } finally {
        isTyping.value = false;
        typingStatus.value = "";
        scrollToBottom();
        nextTick(() => {
          chatInput.value?.focus();
        });

        // Auto-save session after each message
        await saveSession();

        // Sync with store if autonomous mode is active
        syncHistoryWithStore();
      }
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
      console.log('[Roleplay] Checking for autonomous session:', {
        sessionKey: storeData.sessionKey,
        autonomousMode: skillStore.autonomousMode,
        historyLength: storeData.history?.length || 0,
        missedMessages: skillStore.missedMessages,
      });

      if (storeData.sessionKey && skillStore.autonomousMode) {
        // Parse session key to find companion/scenario
        const parts = storeData.sessionKey.split('__');
        if (parts.length >= 4) {
          const [companionId, scenarioId, contentLevel, respMode] = parts;
          console.log('[Roleplay] Looking for companion with ID:', companionId, 'scenario:', scenarioId);

          // Find matching companion - check predefined first, then custom companions
          let companion = predefinedCompanions.find(c => c.id === companionId);
          let companionSource = companion ? 'predefined' : null;

          if (!companion) {
            // Try savedCustomCompanions by ID or name-based ID
            companion = savedCustomCompanions.value.find(c =>
              c.id === companionId ||
              `custom_${c.name?.toLowerCase().replace(/\s+/g, "_")}` === companionId
            );
            if (companion) companionSource = 'savedCustom';
          }

          if (!companion) {
            // Fallback: Try getting companion directly from the store session
            const storeCompanion = skillStore.autonomousSession?.companion;
            if (storeCompanion) {
              const storeCompanionId = storeCompanion.id || `custom_${storeCompanion.name?.toLowerCase().replace(/\s+/g, "_")}`;
              if (storeCompanionId === companionId || storeCompanion.id === companionId) {
                companion = storeCompanion;
                companionSource = 'storeSession';
              }
            }
          }

          if (!companion) {
            // Last resort: Check savedSessions for this exact session key
            const savedSession = savedSessions.value[storeData.sessionKey];
            if (savedSession?.companion) {
              companion = savedSession.companion;
              companionSource = 'savedSession';
            }
          }

          // Find matching scenario
          let scenario = predefinedScenarios.find(s => s.id === scenarioId);
          if (!scenario) {
            // Try store session
            scenario = skillStore.autonomousSession?.scenario?.id === scenarioId
              ? skillStore.autonomousSession.scenario
              : null;
          }
          if (!scenario) {
            // Try savedSessions
            const savedSession = savedSessions.value[storeData.sessionKey];
            scenario = savedSession?.scenario || { id: scenarioId, name: scenarioId };
          }

          console.log('[Roleplay] Found companion:', companion?.name, `(source: ${companionSource})`, 'scenario:', scenario?.name);

          if (companion && scenario) {
            console.log(`[Roleplay] Restoring autonomous session: ${companion.name} in ${scenario.name} with ${storeData.history.length} messages`);
            selectedCompanion.value = companion;
            selectedScenario.value = scenario;
            settings.value.contentLevel = contentLevel;

            // Parse responseMode
            settings.value.enableImage = respMode.includes('image');
            settings.value.enableAudio = respMode.includes('audio');
            settings.value.enableVideo = respMode.includes('video');
            settings.value.enableVision = respMode.includes('vision');

            // Sync history and scene state
            chatHistory.value = [...storeData.history];
            sceneState.value = { ...storeData.sceneState };

            // Enter chat phase
            phase.value = 'chat';

            // Clear missed messages since we're viewing them now
            skillStore.clearMissedMessages();

            // Scroll to see new messages
            nextTick(() => scrollToBottom());
          } else {
            console.warn('[Roleplay] Could not find companion or scenario for session key:', storeData.sessionKey);
          }
        }
      }
    });

    // Cleanup on unmount - DO NOT stop autonomous mode, let it continue
    onUnmounted(() => {
      // Just sync the current state to store if autonomous mode is active
      if (skillStore.autonomousMode && phase.value === 'chat') {
        skillStore.syncAutonomousHistory(chatHistory.value, sceneState.value);
      }
      // Autonomous mode continues running - companion keeps generating messages
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
      isInitializingSession,
      // Autonomous companion mode (uses global skillStore)
      autonomousMode,
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
  gap: 1rem;
}

.companion-card,
.scenario-card {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s;
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
}

.session-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: rgba(97, 55, 142, 0.9);
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
  border-color: rgba(97, 55, 142, 0.6);
}

/* Saved custom companions */
.companion-card.is-saved-custom {
  position: relative;
  border-color: rgba(50, 115, 220, 0.4);
}

.companion-card.is-saved-custom:hover {
  border-color: rgba(50, 115, 220, 0.7);
}

.custom-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
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
  top: 4px;
  right: 4px;
  background: rgba(255, 56, 96, 0.8);
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
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
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(97, 55, 142, 0.4);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  transition: all 0.2s;
}

.saved-session-card:hover {
  background: rgba(97, 55, 142, 0.2);
  border-color: rgba(97, 55, 142, 0.6);
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

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  margin-bottom: 1rem;
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

.chat-message.user {
  flex-direction: row-reverse;
}

.chat-message.user .message-content {
  align-items: flex-end;
}

.chat-message.user .message-text {
  background: rgba(97, 55, 142, 0.9);
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
  max-width: 300px;
  border-radius: 8px;
  overflow: hidden;
}

.message-image img {
  width: 100%;
  display: block;
}

.message-audio {
  width: 100% !important;
}

.message-audio audio {
  width: 100%;
  color-scheme: dark;
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
  border-radius: 20px;
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
  max-width: 400px;
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

/* Media Options Checkboxes */
.media-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.media-option {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  color: #fff;
}

.media-option:hover {
  background: rgba(255, 255, 255, 0.2);
}

.media-option input[type="checkbox"] {
  margin-right: 0.25rem;
}

.media-option .material-symbols-outlined {
  font-size: 18px;
}

.media-option.is-unavailable {
  opacity: 0.5;
  cursor: not-allowed;
}

.media-option.is-unavailable:hover {
  background: rgba(255, 255, 255, 0.1);
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
