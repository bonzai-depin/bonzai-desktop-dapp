<template>
  <div class="roleplay-chat">
    <!-- Setup Phase -->
    <div v-if="phase === 'setup'" class="setup-phase">
      <!-- Companion Selection -->
      <div class="models__activity--payouts mb-5">
        <h3 class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4">
          <span class="material-symbols-outlined mr-2 is-size-1">person</span>
          Choose Companion
        </h3>

        <!-- Predefined Companions -->
        <div class="companion-grid">
          <div
            v-for="companion in predefinedCompanions"
            :key="companion.id"
            class="companion-card"
            :class="{
              'is-selected': selectedCompanion?.id === companion.id,
              'has-session': getSessionInfo(companion)
            }"
            @click="selectCompanion(companion)"
          >
            <div class="companion-avatar">
              <span class="material-symbols-outlined">
                {{ getAvatarIcon(companion.avatar) }}
              </span>
              <!-- Session indicator badge -->
              <span v-if="getSessionInfo(companion)" class="session-badge" :title="getSessionInfo(companion).sessionCount + ' session(s), ' + getSessionInfo(companion).messageCount + ' total msgs'">
                {{ getSessionInfo(companion).sessionCount }}
              </span>
            </div>
            <div class="companion-info">
              <h4 class="companion-name fira-sans-condensed-black-italic">{{ companion.name }}</h4>
              <p class="companion-desc">{{ companion.description }}</p>
            </div>
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
              <h4 class="companion-name fira-sans-condensed-black-italic">Create Custom</h4>
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
              <span v-if="isGenerating" class="material-symbols-outlined rotating mr-1">progress_activity</span>
              <span v-else class="material-symbols-outlined mr-1">magic_button</span>
              {{ isGenerating ? 'Generating...' : 'Generate' }}
            </button>
            <button class="button" @click="showCustomCompanion = false">Cancel</button>
          </div>

          <!-- Generated Custom Companion Preview -->
          <div v-if="customCompanion" class="custom-companion-preview mt-4 p-3">
            <h5 class="fira-sans-condensed-black-italic has-text-success">{{ customCompanion.name }}</h5>
            <p class="is-size-7 has-text-grey-light">{{ customCompanion.description }}</p>
            <div class="tags mt-2">
              <span class="tag is-dark is-small">{{ customCompanion.personality }}</span>
            </div>
            <button class="button is-success is-small mt-2" @click="useCustomCompanion">
              <span class="material-symbols-outlined mr-1" style="font-size: 14px;">check</span>
              Use This Companion
            </button>
          </div>
        </div>
      </div>

      <!-- Scenario Selection -->
      <div class="models__activity--payouts mb-5">
        <h3 class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4">
          <span class="material-symbols-outlined mr-2 is-size-1">landscape</span>
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
            <h4 class="scenario-name fira-sans-condensed-black-italic">{{ scenario.name }}</h4>
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
              <span v-if="isGenerating" class="material-symbols-outlined rotating mr-1">progress_activity</span>
              <span v-else class="material-symbols-outlined mr-1">magic_button</span>
              Generate
            </button>
            <button class="button" @click="showCustomScenario = false">Cancel</button>
          </div>

          <div v-if="customScenario" class="custom-scenario-preview mt-4 p-3">
            <h5 class="fira-sans-condensed-black-italic has-text-success">{{ customScenario.name }}</h5>
            <p class="is-size-7 has-text-grey-light">{{ customScenario.setting }}</p>
            <button class="button is-success is-small mt-2" @click="useCustomScenario">
              <span class="material-symbols-outlined mr-1" style="font-size: 14px;">check</span>
              Use This Scenario
            </button>
          </div>
        </div>
      </div>

      <!-- Settings -->
      <div class="models__activity--payouts mb-5">
        <h3 class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4">
          <span class="material-symbols-outlined mr-2 is-size-1">settings</span>
          Settings
        </h3>

        <div class="columns">
          <div class="column is-6">
            <div class="field">
              <label class="label has-text-white fira-sans-condensed-black-italic">Content Level</label>
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
              <label class="label has-text-white fira-sans-condensed-black-italic">Media Options</label>
              <div class="media-checkboxes">
                <label class="checkbox media-option" :class="{ 'is-unavailable': !isModelAvailable('image_turbo') }">
                  <input type="checkbox" v-model="settings.enableImage" :disabled="!isModelAvailable('image_turbo')">
                  <span class="material-symbols-outlined">image</span>
                  <span>Image</span>
                  <span v-if="!isModelAvailable('image_turbo')" class="tag is-small is-warning ml-1">Download</span>
                </label>
                <label class="checkbox media-option" :class="{ 'is-unavailable': !isModelAvailable('audio') }">
                  <input type="checkbox" v-model="settings.enableAudio" :disabled="!isModelAvailable('audio')">
                  <span class="material-symbols-outlined">volume_up</span>
                  <span>Voice</span>
                  <span v-if="!isModelAvailable('audio')" class="tag is-small is-warning ml-1">Download</span>
                </label>
                <label class="checkbox media-option" :class="{ 'is-unavailable': !isModelAvailable('video_fast') }">
                  <input type="checkbox" v-model="settings.enableVideo" :disabled="!isModelAvailable('video_fast')">
                  <span class="material-symbols-outlined">movie</span>
                  <span>Video</span>
                  <span v-if="!isModelAvailable('video_fast')" class="tag is-small is-warning ml-1">Download</span>
                </label>
                <label class="checkbox media-option" :class="{ 'is-unavailable': !isModelAvailable('vision') }">
                  <input type="checkbox" v-model="settings.enableVision" :disabled="!isModelAvailable('vision')">
                  <span class="material-symbols-outlined">visibility</span>
                  <span>Vision</span>
                  <span v-if="!isModelAvailable('vision')" class="tag is-small is-warning ml-1">Download</span>
                </label>
              </div>
              <p class="help has-text-grey-light mt-2">Video generates on peak emotions. Vision allows image uploads.</p>
            </div>
          </div>
        </div>

        <!-- Model Requirements Warning -->
        <div v-if="!canStartChat" class="notification is-warning is-light mt-4">
          <p class="has-text-weight-bold">
            <span class="material-symbols-outlined mr-1" style="vertical-align: middle;">warning</span>
            Missing Required Models
          </p>
          <p class="is-size-7 mt-2">The LLM model ({{ requiredLLMName }}) must be downloaded before starting a chat.</p>
        </div>
      </div>

      <!-- Saved Sessions for Selected Companion -->
      <div v-if="selectedCompanion && companionSessions.length > 0" class="models__activity--payouts mb-5">
        <h3 class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-3 mb-4">
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
                <span class="scenario-name fira-sans-condensed-black-italic">{{ session.scenario?.name || 'Unknown Scenario' }}</span>
                <span class="tag is-small is-info ml-2">{{ session.messageCount }} msgs</span>
              </div>
              <p class="session-meta is-size-7 has-text-grey-light">
                {{ contentLevels[session.settings?.contentLevel]?.label || session.settings?.contentLevel }}
                • {{ formatResponseMode(session.settings?.responseMode) }}
                <span v-if="session.updatedAt">• {{ formatSessionDate(session.updatedAt) }}</span>
              </p>
            </div>
            <div class="session-actions">
              <button class="button is-info is-small" @click="resumeSession(session.key)">
                <span class="material-symbols-outlined mr-1" style="font-size: 14px;">play_arrow</span>
                Resume
              </button>
              <button class="button is-danger is-small is-outlined" @click="deleteSession(session.key)">
                <span class="material-symbols-outlined" style="font-size: 14px;">delete</span>
              </button>
            </div>
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
          {{ matchingSession ? 'Start New / Resume' : 'Start Roleplay' }}
        </button>
        <p v-if="!canStartChat && modelAvailabilityChecked" class="help has-text-danger mt-2">
          <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">error</span>
          Download the required LLM model first
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
            <button class="delete is-medium" @click="closeSessionManager"></button>
          </div>
          <div class="modal-body">
            <p class="has-text-white mb-4">
              You have a saved session with <strong>{{ selectedCompanion?.name }}</strong> in
              <strong>{{ selectedScenario?.name }}</strong>
              ({{ contentLevels[settings.contentLevel]?.label }}, {{ formatResponseMode(responseMode) }}).
            </p>
            <p class="has-text-grey-light is-size-7 mb-4" v-if="matchingSession">
              {{ matchingSession.history?.length || 0 }} messages • Last activity: {{ formatSessionDate(matchingSession.updatedAt) }}
            </p>
            <div class="buttons is-centered">
              <button class="button is-info is-medium" @click="resumeMatchingSession">
                <span class="material-symbols-outlined mr-2">replay</span>
                Resume Session
              </button>
              <button class="button is-warning is-medium" @click="forceStartNewChat">
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
            <div class="companion-header">
              <span class="material-symbols-outlined mr-2">
                {{ getAvatarIcon(selectedCompanion?.avatar) }}
              </span>
              <div>
                <h3 class="fira-sans-condensed-black-italic has-text-white">
                  {{ selectedCompanion?.name }}
                </h3>
                <p class="has-text-grey-light is-size-7">{{ selectedScenario?.name }}</p>
              </div>
            </div>
          </div>
          <div class="column is-narrow">
            <div class="tags">
              <span class="tag is-info">{{ contentLevels[settings.contentLevel]?.label }}</span>
              <span class="tag is-dark">{{ formatResponseMode(responseMode) }}</span>
            </div>
          </div>
          <div class="column is-narrow">
            <button class="button is-danger is-small" @click="endChat">
              <span class="material-symbols-outlined mr-1" style="font-size: 14px;">close</span>
              End
            </button>
          </div>
        </div>
      </div>

      <!-- Chat Messages -->
      <div class="chat-messages" ref="messagesContainer">
        <!-- Initial Scene Description -->
        <div v-if="selectedScenario" class="scene-description mb-4">
          <div class="notification is-dark">
            <p class="is-italic">{{ selectedScenario.setting }}</p>
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
              {{ msg.role === 'user' ? 'person' : getAvatarIcon(selectedCompanion?.avatar) }}
            </span>
          </div>
          <div class="message-content">
            <div class="message-header">
              <span class="message-sender fira-sans-condensed-black-italic">
                {{ msg.role === 'user' ? 'You' : selectedCompanion?.name }}
              </span>
              <span v-if="msg.emotion" class="message-emotion tag is-small is-info">
                {{ msg.emotion }}
              </span>
            </div>
            <div class="message-text">
              <p v-if="msg.action" class="action-text is-italic has-text-grey-light mb-2">
                *{{ msg.action }}*
              </p>
              <p>{{ msg.content }}</p>
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
              <video controls :src="getVideoSrc(msg.video)" :poster="msg.image ? getImageSrc(msg.image) : undefined"></video>
            </div>
          </div>
        </div>

        <!-- Typing Indicator -->
        <div v-if="isTyping" class="chat-message assistant typing">
          <div class="message-avatar">
            <span class="material-symbols-outlined">
              {{ getAvatarIcon(selectedCompanion?.avatar) }}
            </span>
          </div>
          <div class="message-content">
            <div class="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <p v-if="typingStatus" class="typing-status is-size-7 has-text-grey-light">
              {{ typingStatus }}
            </p>
          </div>
        </div>
      </div>

      <!-- Suggested Responses -->
      <div v-if="suggestedResponses.length > 0 && !isTyping" class="suggested-responses mb-3">
        <button
          v-for="(suggestion, idx) in suggestedResponses"
          :key="idx"
          class="button is-small is-info is-light mr-2 mb-2"
          @click="sendMessage(suggestion)"
        >
          {{ suggestion }}
        </button>
      </div>

      <!-- Image Preview (when uploaded) -->
      <div v-if="uploadedImage" class="uploaded-image-preview mb-3">
        <div class="image-container">
          <img :src="uploadedImage" alt="Uploaded image" />
          <button class="delete is-medium" @click="clearUploadedImage" title="Remove image"></button>
        </div>
        <p v-if="imageAnalysis" class="image-analysis-text is-size-7 has-text-grey-light mt-2">
          <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">visibility</span>
          {{ imageAnalysis.substring(0, 100) }}{{ imageAnalysis.length > 100 ? '...' : '' }}
        </p>
        <p v-else-if="isAnalyzingImage" class="is-size-7 has-text-info">
          <span class="material-symbols-outlined is-spinning" style="font-size: 14px; vertical-align: middle;">sync</span>
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
            >
              <span class="material-symbols-outlined">add_photo_alternate</span>
            </button>
            <input
              ref="imageInput"
              type="file"
              accept="image/*"
              style="display: none;"
              @change="handleImageUpload"
            />
          </div>
          <div class="control is-expanded">
            <input
              ref="chatInput"
              v-model="userMessage"
              class="input is-medium"
              type="text"
              :placeholder="uploadedImage ? `Describe what you see or ask about the image...` : `What do you say to ${selectedCompanion?.name}?`"
              @keyup.enter="sendMessage()"
              :disabled="isTyping"
            />
          </div>
          <div class="control">
            <button
              class="button is-success is-medium"
              @click="sendMessage()"
              :disabled="(!userMessage.trim() && !uploadedImage) || isTyping"
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
import { ref, computed, reactive, nextTick, onMounted, toRaw } from 'vue';
import {
  PREDEFINED_COMPANIONS,
  PREDEFINED_SCENARIOS,
  CONTENT_LEVELS,
  MODEL_REQUIREMENTS,
  roleplayCompanion,
} from '../../skills/flagship.js';

export default {
  name: 'RoleplayChat',
  props: {
    skill: {
      type: Object,
      required: true,
    },
  },
  emits: ['charge-fee'],
  setup(props, { emit }) {
    // Phase management
    const phase = ref('setup'); // 'setup' | 'chat'

    // Setup state
    const selectedCompanion = ref(null);
    const selectedScenario = ref(null);
    const showCustomCompanion = ref(false);
    const showCustomScenario = ref(false);
    const customCompanionPrompt = ref('');
    const customCompanionStyle = ref('romantic');
    const customScenarioPrompt = ref('');
    const customCompanion = ref(null);
    const customScenario = ref(null);
    const isGenerating = ref(false);

    const settings = ref({
      contentLevel: 'pg13',
      // Media options as individual checkboxes
      enableImage: true,
      enableAudio: false,
      enableVideo: false,
      enableVision: false,
    });

    // Build responseMode string from checkbox settings (for backward compatibility)
    const responseMode = computed(() => {
      const parts = ['text'];
      if (settings.value.enableImage) parts.push('image');
      if (settings.value.enableAudio) parts.push('audio');
      if (settings.value.enableVideo) parts.push('video');
      if (settings.value.enableVision) parts.push('vision');
      return parts.join('+');
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // MODEL AVAILABILITY CHECKING
    // ═══════════════════════════════════════════════════════════════════════════
    const modelAvailability = reactive({});
    const modelAvailabilityChecked = ref(false);

    // Required LLM for roleplay
    const REQUIRED_LLM = 'llm_mythomax';
    const requiredLLMName = computed(() => MODEL_REQUIREMENTS[REQUIRED_LLM]?.name || 'MythoMax L2 13B');

    // Check if a specific model is available
    const isModelAvailable = (modelKey) => {
      return modelAvailability[modelKey] === true;
    };

    // Check if chat can start (LLM must be available)
    const canStartChat = computed(() => {
      if (!modelAvailabilityChecked.value) return false;
      return isModelAvailable(REQUIRED_LLM);
    });

    // Check all model availability
    const checkModelAvailability = async () => {
      console.log('[RoleplayChat] Checking model availability...');
      const port = window.BONZAI_SERVER_PORT || 65000;

      // Check LLM model via electron API
      if (window.electronAPI?.checkModel) {
        const llmModel = MODEL_REQUIREMENTS[REQUIRED_LLM];
        if (llmModel?.filename) {
          try {
            const exists = await window.electronAPI.checkModel(llmModel.filename);
            modelAvailability[REQUIRED_LLM] = exists;
            console.log(`[RoleplayChat] LLM ${llmModel.filename}: ${exists ? 'available' : 'not found'}`);
          } catch (e) {
            modelAvailability[REQUIRED_LLM] = false;
          }
        }
      }

      // Check Flask pipelines
      const pipelineMap = {
        'image_turbo': 'image_turbo',
        'image_standard': 'image_standard',
        'image_quality': 'image_quality',
        'audio': 'audio',
        'video_fast': 'video_fast',
        'vision': 'qwen3_vision',
      };

      const checks = Object.entries(pipelineMap).map(async ([modelKey, pipeline]) => {
        try {
          const response = await fetch(`http://localhost:${port}/pipelines/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pipeline }),
          });
          if (response.ok) {
            const data = await response.json();
            modelAvailability[modelKey] = data.ok === true;
          } else {
            modelAvailability[modelKey] = false;
          }
        } catch (e) {
          modelAvailability[modelKey] = false;
        }
        console.log(`[RoleplayChat] ${modelKey}: ${modelAvailability[modelKey] ? 'available' : 'not found'}`);
      });

      await Promise.all(checks);
      modelAvailabilityChecked.value = true;
    };

    // Chat state
    const chatHistory = ref([]);
    const userMessage = ref('');
    const isTyping = ref(false);
    const typingStatus = ref('');
    const suggestedResponses = ref([]);
    const messagesContainer = ref(null);
    const chatInput = ref(null);

    // Vision/Image upload state
    const imageInput = ref(null);
    const uploadedImage = ref(null);        // Base64 data URL of uploaded image
    const uploadedImageBase64 = ref(null);  // Raw base64 without data URL prefix
    const imageAnalysis = ref(null);        // Result from /vision/analyze
    const isAnalyzingImage = ref(false);

    // Scene state for smart image generation and anti-repetition
    const sceneState = ref({
      lastImageAt: -3,           // Message index of last image (-3 to allow first message to have image)
      currentLocation: '',       // Current location/setting
      recentEmotions: [],        // Last few emotions (for variety)
      recentActions: [],         // Last few actions (for variety)
      lastOpeningPhrase: '',     // Last response opening (avoid repetition)
    });

    // Session persistence
    const STORAGE_KEY = 'roleplaySessions';
    const savedSessions = ref({});
    const showSessionManager = ref(false);  // Show session manager overlay

    // Generate unique session key from all parameters
    const getSessionKey = (companion, scenario, contentLevel, responseMode) => {
      if (!companion || !scenario) return null;
      const companionId = companion.id || `custom_${companion.name?.toLowerCase().replace(/\s+/g, '_')}`;
      const scenarioId = scenario.id || `custom_${scenario.name?.toLowerCase().replace(/\s+/g, '_')}`;
      return `${companionId}__${scenarioId}__${contentLevel}__${responseMode}`;
    };

    // Get current session key based on selected options
    const currentSessionKey = computed(() => {
      return getSessionKey(
        selectedCompanion.value,
        selectedScenario.value,
        settings.value.contentLevel,
        responseMode.value  // Use computed responseMode from checkboxes
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
      const companionId = selectedCompanion.value.id || `custom_${selectedCompanion.value.name?.toLowerCase().replace(/\s+/g, '_')}`;
      return Object.entries(savedSessions.value)
        .filter(([key]) => key.startsWith(companionId + '__'))
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
        console.log('[Roleplay] Skip save: no key or empty history');
        return;
      }

      // Convert Vue reactive proxies to plain objects for Electron IPC
      // Use JSON.parse(JSON.stringify()) to deep clone and remove non-serializable data
      const plainCompanion = JSON.parse(JSON.stringify(toRaw(selectedCompanion.value)));
      const plainScenario = JSON.parse(JSON.stringify(toRaw(selectedScenario.value)));
      const plainSettings = JSON.parse(JSON.stringify(toRaw(settings.value)));
      const plainSceneState = JSON.parse(JSON.stringify(toRaw(sceneState.value)));

      // Add responseMode string to settings for backward compatibility
      const settingsWithMode = {
        ...plainSettings,
        responseMode: responseMode.value,  // Store computed string for session key matching
      };

      const session = {
        companion: plainCompanion,
        scenario: plainScenario,
        settings: settingsWithMode,
        history: chatHistory.value.map(msg => {
          const plainMsg = JSON.parse(JSON.stringify(toRaw(msg)));
          // Persist all media (image, audio, video) for full session restoration
          return plainMsg;
        }),
        // Persist scene state for smart image generation continuity
        sceneState: plainSceneState,
        updatedAt: Date.now(),
      };

      savedSessions.value[key] = session;

      try {
        if (window.electronAPI?.store?.set) {
          // Convert the entire sessions object to plain object
          const plainSessions = JSON.parse(JSON.stringify(toRaw(savedSessions.value)));
          await window.electronAPI.store.set(STORAGE_KEY, plainSessions);
          console.log(`[Roleplay] Session saved for ${key}: ${session.history.length} messages`);
        } else {
          console.warn('[Roleplay] Electron store API not available - session not persisted');
        }
      } catch (e) {
        console.error('[Roleplay] Failed to save session:', e);
      }
    };

    // Load all saved sessions from storage
    const loadSessions = async () => {
      try {
        if (window.electronAPI?.store?.get) {
          const stored = await window.electronAPI.store.get(STORAGE_KEY, {});
          savedSessions.value = stored || {};
          const sessionKeys = Object.keys(savedSessions.value);
          console.log(`[Roleplay] Loaded ${sessionKeys.length} saved sessions:`, sessionKeys);
        } else {
          console.warn('[Roleplay] Electron store API not available - no sessions loaded');
          savedSessions.value = {};
        }
      } catch (e) {
        console.error('[Roleplay] Failed to load sessions:', e);
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
      if (savedSettings.responseMode && typeof savedSettings.responseMode === 'string') {
        // Old format: convert responseMode string to checkbox settings
        const mode = savedSettings.responseMode;
        settings.value = {
          contentLevel: savedSettings.contentLevel || 'pg13',
          enableImage: mode.includes('image'),
          enableAudio: mode.includes('audio'),
          enableVideo: mode.includes('video'),
          enableVision: mode.includes('vision'),
        };
      } else if (savedSettings.enableImage !== undefined) {
        // New format: use checkbox settings directly
        settings.value = { ...savedSettings };
      } else {
        // Fallback defaults
        settings.value = {
          contentLevel: savedSettings.contentLevel || 'pg13',
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

      return true;
    };

    // Delete a session
    const deleteSession = async (key) => {
      if (!key) return;
      delete savedSessions.value[key];
      try {
        if (window.electronAPI?.store?.set) {
          // Convert to plain object before saving
          const plainSessions = JSON.parse(JSON.stringify(toRaw(savedSessions.value)));
          await window.electronAPI.store.set(STORAGE_KEY, plainSessions);
          console.log(`[Roleplay] Session deleted: ${key}`);
        }
      } catch (e) {
        console.error('[Roleplay] Failed to delete session:', e);
      }
    };

    // Resume a specific session
    const resumeSession = (key) => {
      if (loadSession(key)) {
        phase.value = 'chat';
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
      const parts = key.split('__');
      return {
        companionId: parts[0] || '',
        scenarioId: parts[1] || '',
        contentLevel: parts[2] || '',
        responseMode: parts[3] || '',
      };
    };

    // Get formatted date for session
    const formatSessionDate = (timestamp) => {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Data
    const predefinedCompanions = PREDEFINED_COMPANIONS;
    const predefinedScenarios = PREDEFINED_SCENARIOS;
    const contentLevels = CONTENT_LEVELS;

    // Computed
    const canStart = computed(() => {
      return selectedCompanion.value && selectedScenario.value && canStartChat.value;
    });

    // Methods
    const getAvatarIcon = (avatar) => {
      const icons = {
        woman: 'face_4',
        man: 'face',
        android: 'smart_toy',
        demon: 'mood_bad',
        soldier: 'military_tech',
        fantasy: 'auto_awesome',
      };
      return icons[avatar] || 'person';
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
          { description: customCompanionPrompt.value, style: customCompanionStyle.value },
          { updateStatus: (s) => console.log('[Roleplay]', s) }
        );
        customCompanion.value = result;
      } catch (e) {
        console.error('[Roleplay] Failed to generate companion:', e);
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
          { description: customScenarioPrompt.value, mood: 'romantic' },
          { updateStatus: (s) => console.log('[Roleplay]', s) }
        );
        customScenario.value = result;
      } catch (e) {
        console.error('[Roleplay] Failed to generate scenario:', e);
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
        'text': 'Text',
        'text+image': 'Text + Image',
        'text+audio': 'Text + Voice',
        'text+image+audio': 'Full Multimodal',
        'text+image+video': 'Text + Image + Video',
        'text+image+audio+video': 'Ultimate Experience',
      };
      return modes[mode] || mode;
    };

    // Start a new chat (fresh session)
    const startNewChat = () => {
      // Check if there's an existing session with same params
      const key = currentSessionKey.value;
      if (key && savedSessions.value[key]) {
        // Show session manager to let user choose
        showSessionManager.value = true;
        return;
      }

      // Start fresh
      chatHistory.value = [];
      sceneState.value = {
        lastImageAt: -3,
        currentLocation: selectedScenario.value?.setting || '',
        recentEmotions: [],
        recentActions: [],
        lastOpeningPhrase: '',
      };

      phase.value = 'chat';
      showSessionManager.value = false;
      suggestedResponses.value = [];

      nextTick(() => {
        chatInput.value?.focus();
        scrollToBottom();
      });
    };

    // Force start new chat (overwrite existing)
    const forceStartNewChat = async () => {
      const key = currentSessionKey.value;
      if (key) {
        await deleteSession(key);
      }

      chatHistory.value = [];
      sceneState.value = {
        lastImageAt: -3,
        currentLocation: selectedScenario.value?.setting || '',
        recentEmotions: [],
        recentActions: [],
        lastOpeningPhrase: '',
      };

      phase.value = 'chat';
      showSessionManager.value = false;
      suggestedResponses.value = [];

      nextTick(() => {
        chatInput.value?.focus();
        scrollToBottom();
      });
    };

    // Resume the matching session (same companion + scenario + settings)
    const resumeMatchingSession = () => {
      const key = currentSessionKey.value;
      if (key && loadSession(key)) {
        phase.value = 'chat';
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
      const assistantMessages = chatHistory.value.filter(m => m.role === 'assistant');
      const lastImageIdx = assistantMessages.reduce((lastIdx, msg, idx) => {
        return msg.image ? idx : lastIdx;
      }, -3);

      sceneState.value = {
        lastImageAt: lastImageIdx,
        currentLocation: selectedScenario.value?.setting || '',
        recentEmotions: assistantMessages.slice(-3).map(m => m.emotion).filter(Boolean),
        recentActions: assistantMessages.slice(-2).map(m => m.action).filter(Boolean),
        lastOpeningPhrase: assistantMessages.length > 0
          ? (assistantMessages[assistantMessages.length - 1].content || '').split(/\s+/).slice(0, 5).join(' ')
          : '',
      };
    };

    const endChat = async () => {
      // Save session before ending
      await saveSession();
      phase.value = 'setup';
      chatHistory.value = [];
      suggestedResponses.value = [];
      showSessionManager.value = false;
    };

    const scrollToBottom = () => {
      nextTick(() => {
        if (messagesContainer.value) {
          messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
        }
      });
    };

    const getImageSrc = (image) => {
      if (!image) return '';
      if (image.startsWith('data:')) return image;
      return `data:image/png;base64,${image}`;
    };

    const getAudioSrc = (audio) => {
      if (!audio) return '';
      if (audio.startsWith('data:')) return audio;
      if (audio.startsWith('http')) return audio;
      // Local file path - use Flask media stream endpoint
      if (audio.startsWith('/')) {
        const port = window.BONZAI_SERVER_PORT || 65000;
        return `http://localhost:${port}/media/stream?path=${encodeURIComponent(audio)}`;
      }
      return `data:audio/wav;base64,${audio}`;
    };

    const getVideoSrc = (video) => {
      if (!video) return '';
      if (video.startsWith('data:')) return video;
      if (video.startsWith('http')) return video;
      // Local file path - use Flask media stream endpoint
      if (video.startsWith('/')) {
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
        uploadedImageBase64.value = e.target.result.split(',')[1];

        // Automatically analyze the image
        await analyzeUploadedImage();
      };
      reader.readAsDataURL(file);

      // Reset input so same file can be selected again
      event.target.value = '';
    };

    const analyzeUploadedImage = async () => {
      if (!uploadedImageBase64.value) return;

      isAnalyzingImage.value = true;
      imageAnalysis.value = null;

      try {
        const port = window.BONZAI_SERVER_PORT || 65000;
        const response = await fetch(`http://localhost:${port}/vision/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.response) {
            imageAnalysis.value = data.response;
            console.log('[RoleplayChat] Vision analysis:', data.response);
          }
        } else {
          console.warn('[RoleplayChat] Vision analysis failed:', await response.text());
        }
      } catch (e) {
        console.error('[RoleplayChat] Vision analysis error:', e);
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
      const visionData = hasImage ? {
        imageBase64: uploadedImageBase64.value,
        imageAnalysis: imageAnalysis.value,
        imageDataUrl: uploadedImage.value,
      } : null;

      // Build user message content
      const messageContent = msg || (hasImage ? '*shares an image*' : '');

      // Add user message (include image if present)
      chatHistory.value.push({
        role: 'user',
        content: messageContent,
        image: visionData?.imageDataUrl || null,  // Show uploaded image in chat
      });
      userMessage.value = '';
      suggestedResponses.value = [];
      clearUploadedImage();  // Clear after capturing
      scrollToBottom();

      // No fee - chatting is free with access level

      // Generate response
      isTyping.value = true;
      typingStatus.value = '';

      // Build settings with computed responseMode
      const executionSettings = {
        contentLevel: settings.value.contentLevel,
        responseMode: responseMode.value,  // Built from checkbox options
      };

      try {
        const result = await roleplayCompanion.execution.executeMessage(
          {
            userMessage: messageContent,
            session: {
              companion: selectedCompanion.value,
              scenario: selectedScenario.value,
              history: chatHistory.value,
            },
            settings: executionSettings,
            sceneState: sceneState.value,
            visionData,  // Pass vision analysis to LLM
          },
          {
            updateStatus: (status) => {
              typingStatus.value = status;
            },
          }
        );

        if (result.success) {
          // Add assistant message (now may include video)
          chatHistory.value.push({
            role: 'assistant',
            content: result.response.response,
            emotion: result.response.emotion,
            action: result.response.action,
            image: result.response.image,
            audio: result.response.audio,
            video: result.response.video,  // New: video for peak emotions
          });

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
            console.log(`[Roleplay] Image skipped: shouldVisualize=${result.meta.shouldVisualize}`);
          }
        }
      } catch (e) {
        console.error('[Roleplay] Message failed:', e);
        chatHistory.value.push({
          role: 'assistant',
          content: `*${selectedCompanion.value?.name} seems distracted for a moment* I'm sorry, could you repeat that?`,
          emotion: 'confused',
        });
      } finally {
        isTyping.value = false;
        typingStatus.value = '';
        scrollToBottom();
        nextTick(() => {
          chatInput.value?.focus();
        });

        // Auto-save session after each message
        await saveSession();
      }
    };

    // Load sessions and check model availability on mount
    onMounted(async () => {
      await Promise.all([
        loadSessions(),
        checkModelAvailability(),
      ]);
    });

    // Get session info for a companion (aggregated across all scenarios/settings)
    const getSessionInfo = (companion) => {
      if (!companion) return null;
      const companionId = companion.id || `custom_${companion.name?.toLowerCase().replace(/\s+/g, '_')}`;

      // Find all sessions for this companion
      const sessions = Object.entries(savedSessions.value)
        .filter(([key]) => key.startsWith(companionId + '__'))
        .map(([, session]) => session);

      if (sessions.length === 0) return null;

      // Aggregate info
      const totalMessages = sessions.reduce((sum, s) => sum + (s.history?.length || 0), 0);
      const latestUpdate = Math.max(...sessions.map(s => s.updatedAt || 0));

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
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.companion-card:hover,
.scenario-card:hover {
  background: rgba(0, 0, 0, 0.4);
  border-color: rgba(255, 255, 255, 0.2);
}

.companion-card.is-selected,
.scenario-card.is-selected {
  border-color: #00d1b2;
  background: rgba(0, 209, 178, 0.1);
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
  background: #3273dc;
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
  border-color: rgba(50, 115, 220, 0.4);
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
  border: 1px solid rgba(50, 115, 220, 0.3);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  transition: all 0.2s;
}

.saved-session-card:hover {
  background: rgba(0, 0, 0, 0.4);
  border-color: rgba(50, 115, 220, 0.5);
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
  background: rgba(0, 209, 178, 0.1);
  border-radius: 8px;
  border: 1px solid #00d1b2;
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
  border: 2px solid transparent;
  transition: all 0.2s;
}

.content-level-option:hover {
  background: rgba(0, 0, 0, 0.4);
}

.content-level-option.is-selected {
  border-color: #00d1b2;
  background: rgba(0, 209, 178, 0.1);
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
  color: #00d1b2;
}

.chat-messages {
  max-height: 500px;
  overflow-y: auto;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.scene-description .notification {
  background: rgba(255, 255, 255, 0.05);
  border-left: 3px solid #00d1b2;
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
  background: #3273dc;
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
}

.action-text {
  font-size: 0.9rem;
  opacity: 0.8;
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
  width: 100%;
}

.message-audio audio {
  width: 100%;
  max-width: 300px;
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
  0%, 80%, 100% {
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
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
</style>
