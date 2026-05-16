<template>
  <div class="meditation-skill">
    <!-- Scenario Selector (hidden in fullscreen) -->
    <section
      v-if="!isFullscreen"
      class="meditation-journey-panel skill-panel"
    >
      <div>
        <div>
          <h2 class="bz-h2 skill-section-title">
            Choose Your Journey
          </h2>
          <span class="category-selector">
            <template v-for="scenario in scenarios" :key="scenario.id">
              <input
                type="radio"
                name="meditation_scenario"
                :id="'meditation_' + scenario.id"
                :value="scenario.id"
                :checked="selectedScenario?.id === scenario.id"
                @change="selectScenario(scenario)"
              />
              <label :for="'meditation_' + scenario.id" class="radio category">
                <span class="material-symbols-outlined" style="font-size: 18px;">
                  {{ scenario.icon }}
                </span>
                {{ scenario.name }}
              </label>
            </template>
          </span>
        </div>
      </div>

      <!-- Scenario Description -->
      <div v-if="selectedScenario" class="bz-notice bz-notice--info scenario-notice">
        <span class="bz-notice__icon"><span class="material-symbols-outlined">spa</span></span>
        <div class="bz-notice__body">
          <div class="bz-notice__title">{{ selectedScenario.name }}</div>
          <p class="bz-notice__text">{{ selectedScenario.description }}</p>
          <div class="scenario-tags">
            <span class="skill-chip">{{ selectedScenario.intention }}</span>
            <span class="skill-chip">{{ selectedScenario.environment }}</span>
          </div>
        </div>
      </div>
    </section>

    <div v-if="!isFullscreen" class="meditation-session-strip">
      <div class="meditation-session-cell">
        <span>Journey</span>
        <strong>{{ selectedScenario?.name || 'Choose' }}</strong>
      </div>
      <div class="meditation-session-cell">
        <span>Breath</span>
        <strong>{{ breathingText }}</strong>
      </div>
      <div class="meditation-session-cell">
        <span>Progress</span>
        <strong>{{ sessionProgress }}%</strong>
      </div>
      <div class="meditation-session-cell">
        <span>Audio</span>
        <strong>{{ Math.round(volume * 100) }}%</strong>
      </div>
    </div>

    <!-- Meditation Visualization Area -->
    <div
      ref="meditationDisplay"
      class="meditation-display meditation-stage"
      :class="{ 'is-active': isPlaying, 'is-fullscreen': isFullscreen }"
    >
      <!-- Background Image with Ken Burns Effect -->
      <div
        class="meditation-background"
        :class="{ 'ken-burns': isPlaying && imageSrc }"
        :style="backgroundStyle"
      >
        <div class="meditation-overlay"></div>
      </div>

      <!-- Content Overlay -->
      <div class="meditation-content" :class="{ 'fullscreen-pad': isFullscreen }">
        <!-- Loading State -->
        <div v-if="isGenerating" class="meditation-loading">
          <span class="material-symbols-outlined rotating" style="font-size: 64px; color: var(--bz-fg);">
            progress_activity
          </span>
          <p class="meditation-status bz-h3">
            {{ generationStatus }}
          </p>
          <BonzaiPulse
            v-if="generationProgress > 0"
            variant="bar"
            :percent="generationProgress"
            width="300px"
          />
        </div>

        <!-- Idle State -->
        <div v-else-if="!meditationData && !isPlaying" class="meditation-idle">
          <span class="material-symbols-outlined" style="font-size: 120px; color: var(--bz-fg-faint);">
            spa
          </span>
          <p class="meditation-status bz-body">
            Select a scenario and begin your meditation
          </p>
        </div>

        <!-- Playing State -->
        <div v-else-if="isPlaying" class="meditation-playing">
          <div class="breathing-circle" :class="breathingPhase">
            <span class="material-symbols-outlined" style="font-size: 48px; color: var(--bz-fg);">
              {{ breathingPhase === 'inhale' ? 'air' : breathingPhase === 'hold' ? 'pause' : 'airwave' }}
            </span>
          </div>
          <p class="breathing-text bz-h2">
            {{ breathingText }}
          </p>
        </div>

        <!-- Completed State -->
        <div v-else-if="meditationData && !isPlaying" class="meditation-completed">
          <span class="material-symbols-outlined" style="font-size: 80px; color: var(--bz-fg-mid);">
            check_circle
          </span>
          <h3 class="meditation-ready-title bz-h2">
            {{ meditationData.title }}
          </h3>
          <p class="meditation-status bz-body">
            Session ready - Press play to begin
          </p>
        </div>
      </div>

      <!-- Fullscreen Toggle Button -->
      <button
        class="fullscreen-toggle"
        :class="{ 'fullscreen-offset': isFullscreen }"
        @click="toggleFullscreen"
        :title="isFullscreen ? 'Exit Fullscreen (ESC)' : 'Enter Fullscreen'"
      >
        <span class="material-symbols-outlined">
          {{ isFullscreen ? 'fullscreen_exit' : 'fullscreen' }}
        </span>
      </button>

      <!-- Audio Player (hidden) -->
      <audio
        ref="audioPlayer"
        :src="audioSrc"
        @ended="onAudioEnded"
        @timeupdate="onTimeUpdate"
        @loadedmetadata="onAudioLoaded"
      ></audio>
    </div>

    <!-- Controls (hidden in fullscreen) -->
    <section v-if="!isFullscreen" class="meditation-controls meditation-console skill-panel">
      <div class="skill-action-row">
        <div>
          <!-- Generate Button -->
          <button
            v-if="!meditationData && !isGenerating"
            class="bz-btn bz-btn--success bz-btn--lg"
            :disabled="!selectedScenario"
            @click="generateMeditation"
          >
            <span class="material-symbols-outlined">auto_awesome</span>
            Create Meditation
          </button>

          <!-- Play/Pause Controls -->
          <div v-else class="skill-action-row">
            <button
              v-if="!isPlaying"
              class="bz-btn bz-btn--success bz-btn--lg"
              :disabled="isGenerating || !meditationData"
              @click="playMeditation"
            >
              <span class="material-symbols-outlined">play_arrow</span>
              {{ audioEnded ? 'Replay' : 'Begin Session' }}
            </button>
            <button
              v-else
              class="bz-btn bz-btn--warning bz-btn--lg"
              @click="pauseMeditation"
            >
              <span class="material-symbols-outlined">pause</span>
              Pause
            </button>
            <button
              class="bz-btn bz-btn--destructive bz-btn--lg"
              @click="resetMeditation"
              :disabled="isGenerating"
            >
              <span class="material-symbols-outlined">stop</span>
              End Session
            </button>
          </div>
        </div>
      </div>

      <!-- Volume Control -->
      <div v-if="meditationData" class="volume-control volume-row">
        <span class="material-symbols-outlined volume-icon">
              {{ volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up' }}
        </span>
          <div class="volume-slider">
            <input
              type="range"
              class="skill-range"
              :min="0"
              :max="1"
              :step="0.1"
              v-model.number="volume"
              @input="updateVolume"
            />
          </div>
          <div>
            <span class="bz-shout">
              {{ Math.round(volume * 100) }}%
            </span>
          </div>
      </div>
    </section>

    <!-- Session History (hidden in fullscreen) -->
    <div v-if="!isFullscreen && sessionHistory.length > 0" class="meditation-history skill-panel">
      <h2 class="bz-h2 skill-section-title">Recent Sessions</h2>
      <div
        v-for="session in sessionHistory.slice(0, 5)"
        :key="session.id"
        class="session-card"
        @click="loadSession(session)"
      >
        <div class="session-card-row">
          <div class="session-card-icon">
            <span class="material-symbols-outlined" style="font-size: 32px;">
              {{ getScenarioIcon(session.scenarioId) }}
            </span>
          </div>
          <div class="session-card-body">
            <p class="session-card-title">
              {{ session.title }}
            </p>
            <p class="session-card-meta bz-meta">
              {{ session.scenarioName }} - {{ formatDate(session.createdAt) }}
            </p>
          </div>
          <div>
            <button
              class="bz-iconbtn bz-iconbtn--sm danger-icon"
              @click="deleteSession(session.id, $event)"
              title="Delete session"
            >
              <span class="material-symbols-outlined" style="font-size: 18px;">
                delete
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import BonzaiPulse from '../BonzaiPulse.vue';
import { getAuthHeaders } from '../../services/auth.service.js';
import { hasPurchasedSkill, isDevMode } from '../../services/agent.service.js';

const STORAGE_KEY = 'meditation-forge-sessions';
const SKILL_ID = 'meditation-forge-v1.0.0';

// Default LLM config - matches GenerativeText.vue structure
const DEFAULT_LLM = {
  filename: 'meta-llama-3.1-8b-instruct-q4_k_m.gguf',
  filesizeBytes: 4.92e9,
  parameters: 8000000000,
  context: 131072,
};

// Load LLM model before generating text
async function loadLLM(config = DEFAULT_LLM) {
  if (!window.electronAPI?.loadModel) {
    throw new Error('LLM API not available. Make sure you are running in the Electron app.');
  }
  console.log('[MeditationForge] Loading LLM:', config.filename);
  await window.electronAPI.loadModel(config);
  console.log('[MeditationForge] LLM loaded successfully');
}

// Unload LLM to free memory for image/audio generation
async function unloadLLM() {
  if (!window.electronAPI?.unloadModel) return;
  console.log('[MeditationForge] Unloading LLM to free memory...');
  await window.electronAPI.unloadModel();
}

export default {
  name: 'MeditationForgeSkill',
  components: { BonzaiPulse },
  props: {
    skill: {
      type: Object,
      default: null,
    },
    modelAvailable: {
      type: [Function, Boolean],
      default: true,
    },
  },
  emits: ['meditation-created', 'status-update'],
  setup(props, { emit }) {
    // Refs
    const audioPlayer = ref(null);
    const meditationDisplay = ref(null);

    // State
    const selectedScenario = ref(null);
    const isGenerating = ref(false);
    const isPlaying = ref(false);
    const isFullscreen = ref(false);
    const audioEnded = ref(false);
    const generationStatus = ref('');
    const generationProgress = ref(0);
    const meditationData = ref(null);
    const audioSrc = ref('');
    const imageSrc = ref('');
    const volume = ref(0.7);
    const elapsedTime = ref(0);
    const totalDuration = ref(0);
    const breathingPhase = ref('inhale');
    const breathingText = ref('Breathe In');
    const sessionHistory = ref([]);

    // Breathing animation interval
    let breathingInterval = null;

    // 8 Meditation Scenarios with pre-written scripts (no LLM needed)
    const scenarios = [
      {
        id: 'forest-calm',
        name: 'Forest Serenity',
        icon: 'park',
        description: 'Wander through an ancient forest, feeling the soft moss beneath your feet and the gentle whisper of leaves above.',
        intention: 'Stress Relief',
        environment: 'forest',
        visualPrompt: 'mystical ancient forest, soft sunlight filtering through tall trees, moss-covered ground, peaceful clearing with soft ferns, ethereal atmosphere, photorealistic, 8k',
        script: `Welcome to your forest meditation. Find a comfortable position and gently close your eyes.

Take a deep breath in through your nose... hold... and slowly release through your mouth.

Imagine yourself standing at the edge of an ancient forest. The air is fresh and clean, carrying the gentle scent of pine and earth.

Breathe in... hold... breathe out.

As you step onto the soft, moss-covered path, feel the cushion beneath your feet. Sunlight filters through the towering trees above, creating dancing patterns of light and shadow.

Continue to breathe slowly. In... hold... and out.

Listen to the gentle rustle of leaves in the breeze. A bird calls softly in the distance. You are completely safe here, surrounded by nature's embrace.

With each breath, feel tension leaving your body. Your shoulders relax. Your jaw unclenches. Your mind grows quiet.

Breathe in peace... hold... breathe out any worry.

Walk deeper into the forest. Notice a small clearing ahead, bathed in warm, golden light. This is your sanctuary.

Rest here for a moment. You are whole. You are calm. You are at peace.

When you're ready, slowly bring your awareness back. Wiggle your fingers and toes. Take one final deep breath, and gently open your eyes.

Carry this peace with you. Namaste.`,
        breathingPattern: { inhale: 4, hold: 4, exhale: 6 },
      },
      {
        id: 'ocean-waves',
        name: 'Ocean Embrace',
        icon: 'waves',
        description: 'Rest on a pristine beach as gentle waves wash away your worries, the rhythm of the sea syncing with your breath.',
        intention: 'Deep Relaxation',
        environment: 'beach',
        visualPrompt: 'serene tropical beach at golden hour, gentle turquoise waves, soft sand, palm trees swaying, warm peaceful atmosphere, photorealistic, 8k',
        script: `Welcome to your ocean meditation. Settle into a comfortable position and let your eyes gently close.

Take a slow, deep breath... hold it... and release.

Picture yourself on a beautiful, secluded beach. The sand is soft and warm beneath you. The sky above glows with the soft colors of sunset.

Breathe in... hold... breathe out.

Listen to the gentle rhythm of the waves. In... and out. In... and out. Let your breath sync with the ocean's ancient pulse.

Feel the warm breeze on your skin, carrying the fresh salt air. Each wave that washes ashore carries away a little more tension, a little more stress.

Breathe deeply. In... hold... and release.

The water is warm and crystal clear. Imagine it gently washing over your feet, your ankles. So soothing. So peaceful.

With each wave, feel yourself sinking deeper into relaxation. Your body is heavy and calm. Your mind is clear like the horizon.

Breathe in the peace of the ocean... hold... breathe out everything that no longer serves you.

You are held by the earth. You are cleansed by the sea. You are warmed by the sun.

Stay here as long as you need. When ready, slowly return. Feel your body. Take a deep breath. And gently open your eyes.

The ocean's peace remains within you. Namaste.`,
        breathingPattern: { inhale: 4, hold: 2, exhale: 6 },
      },
      {
        id: 'mountain-peak',
        name: 'Mountain Clarity',
        icon: 'landscape',
        description: 'Ascend to a peaceful mountain peak where the air is crisp and your mind becomes clear as the endless sky.',
        intention: 'Mental Clarity',
        environment: 'mountain',
        visualPrompt: 'majestic mountain peak at sunrise, vast panoramic view, crisp clean air, snow-capped peaks in distance, golden light, photorealistic, 8k',
        script: `Welcome to your mountain meditation. Find stillness in your body and softly close your eyes.

Draw in a deep, cleansing breath... hold... and let it flow out.

You stand at the summit of a magnificent mountain. The air is crisp and pure, filling your lungs with clarity.

Breathe in... hold... breathe out.

Before you stretches an endless vista. Snow-capped peaks touch the sky. The world below seems distant, peaceful, small.

With each breath, feel your mind expanding like this vast horizon. Clear. Open. Limitless.

Breathe deeply. In... hold... release.

The morning sun rises, painting the sky in gold and rose. Its warmth touches your face, filling you with quiet strength.

Up here, above the clouds, there is only peace. Only clarity. Only the present moment.

Breathe in clarity... hold... breathe out confusion.

Feel yourself grounded like the mountain itself. Unshakeable. Peaceful. Strong.

Your thoughts settle like snow gently falling. Each one acknowledged, then released into the vast sky.

Breathe. Be still. Be clear.

When you're ready, begin your descent. Carry this mountain clarity with you. Take a deep breath. Open your eyes.

Your mind remains clear as the sky. Namaste.`,
        breathingPattern: { inhale: 5, hold: 5, exhale: 5 },
      },
      {
        id: 'zen-garden',
        name: 'Zen Garden',
        icon: 'yard',
        description: 'Find stillness in a traditional Japanese garden, where raked sand patterns and flowing water guide you to inner peace.',
        intention: 'Mindfulness',
        environment: 'garden',
        visualPrompt: 'traditional Japanese zen garden, perfectly raked sand patterns, moss-covered stones, small waterfall, cherry blossoms, peaceful atmosphere, photorealistic, 8k',
        script: `Welcome to your zen garden meditation. Allow your body to settle and your eyes to close.

Breathe in slowly... hold gently... exhale completely.

You are seated in a perfect Japanese garden. Before you, white sand has been raked into flowing patterns, like ripples on still water.

Breathe in... hold... breathe out.

Notice the moss-covered stones, placed with intention. Each one has found its perfect place. Just as you have found yours, right here, right now.

Listen to the soft trickle of water from a small bamboo fountain. Steady. Peaceful. Present.

Breathe deeply. In... hold... out.

Cherry blossoms drift slowly down, each petal a reminder of life's beautiful impermanence. You do not need to hold onto anything. Simply observe. Simply be.

In this moment, there is nothing to fix. Nothing to achieve. Only presence.

Breathe in this moment... hold... release.

Your mind becomes like the raked sand. Calm patterns emerge from stillness. Thoughts come and go like clouds reflected in a pond.

You are the garden. You are the stillness. You are peace itself.

When you feel complete, gently return. Notice your breath. Feel your body. Open your eyes with soft awareness.

Carry this stillness within. Namaste.`,
        breathingPattern: { inhale: 4, hold: 4, exhale: 8 },
      },
      {
        id: 'cosmic-journey',
        name: 'Cosmic Journey',
        icon: 'rocket_launch',
        description: 'Float through the cosmos, surrounded by stars and nebulas, feeling the infinite peace of the universe.',
        intention: 'Perspective',
        environment: 'space',
        visualPrompt: 'vast cosmic nebula, swirling galaxies, millions of stars, deep space colors purple blue gold, ethereal and infinite, photorealistic, 8k',
        script: `Welcome to your cosmic meditation. Let your body become completely still. Close your eyes.

Take a deep breath of starlight... hold... and release into the void.

You are floating gently through space. Around you, billions of stars twinkle like diamonds scattered across velvet darkness.

Breathe in... hold... breathe out.

Feel the weightlessness. No gravity. No burden. Just peaceful floating through the infinite cosmos.

A beautiful nebula swirls nearby, its colors of purple, blue, and gold painting the darkness. You are witnessing the birth of stars.

Breathe deeply. In... hold... release.

From here, you can see just how vast the universe is. And yet, you are part of it all. Made of the same stardust as the stars themselves.

Your worries seem small now. Your problems, distant galaxies. Here, there is only wonder. Only peace.

Breathe in the infinite... hold... breathe out the finite.

You are connected to everything. Every atom in your body once lived in a star. You belong to the universe, and it belongs to you.

Float here in cosmic peace. Timeless. Boundless. Free.

When ready, begin your gentle return to Earth. Feel gravity's soft embrace. Take a deep breath. Open your eyes.

You carry the universe within you. Namaste.`,
        breathingPattern: { inhale: 6, hold: 3, exhale: 6 },
      },
      {
        id: 'underwater-sanctuary',
        name: 'Underwater Sanctuary',
        icon: 'scuba_diving',
        description: 'Descend into a peaceful underwater realm where colorful coral and gentle currents cradle your consciousness.',
        intention: 'Deep Calm',
        environment: 'underwater',
        visualPrompt: 'serene underwater coral reef, bioluminescent creatures, gentle light rays from surface, colorful fish, peaceful blue-green waters, photorealistic, 8k',
        script: `Welcome to your underwater meditation. Let your body sink into comfort and close your eyes.

Take a deep breath... hold... and let it bubble away.

You are floating in warm, crystal-clear water. Sunlight filters down from above, creating dancing beams of gold and blue.

Breathe in... hold... breathe out.

Around you, a coral reef blooms with life. Soft corals sway in the gentle current like an underwater garden. Fish of every color glide peacefully past.

Feel the water support you completely. You are weightless. Held. Safe.

Breathe slowly. In... hold... out.

A sea turtle glides by, ancient and serene. It has no hurry. Neither do you. Time moves differently here in the deep.

Bioluminescent creatures pulse with soft blue light in the distance. Nature's magic, surrounding you in wonder.

Breathe in calm... hold... breathe out tension.

Let the gentle current carry away anything you wish to release. Stress dissolves like salt in the sea. Worry drifts away like seaweed.

You are cleansed. You are calm. You are one with the ocean.

When you're ready, slowly rise toward the light. Feel the surface approaching. Take a deep breath. Open your eyes.

The ocean's depth remains in your heart. Namaste.`,
        breathingPattern: { inhale: 4, hold: 4, exhale: 6 },
      },
      {
        id: 'sleep-sanctuary',
        name: 'Sleep Sanctuary',
        icon: 'bedtime',
        description: 'Drift into peaceful rest, guided through layers of relaxation into deep, restorative sleep.',
        intention: 'Better Sleep',
        environment: 'bedroom',
        visualPrompt: 'cozy bedroom at night, soft moonlight through sheer curtains, warm blankets, starry night sky visible, peaceful and dreamy atmosphere, photorealistic, 8k',
        script: `Welcome to your sleep meditation. You are safe. You are comfortable. Let your eyes close.

Take a slow breath in... hold softly... and release completely.

Feel the soft bed beneath you. The weight of warm blankets over your body. Everything is perfect for rest.

Breathe in... hold... breathe out.

Moonlight filters gently through the curtains, painting soft silver patterns on the walls. Outside, the world is quiet. Still.

Let your feet relax completely. Feel them growing heavy, sinking into the mattress. So heavy. So relaxed.

Breathe slowly. In... hold... out.

This heaviness spreads up through your legs. Your calves release. Your thighs soften. Your hips melt into the bed.

Each breath takes you deeper. Deeper into relaxation. Deeper into peace.

Your stomach is soft. Your chest is calm. Your arms are heavy, sinking down. Your hands uncurl.

Breathe in peace... hold... breathe out the day.

Your shoulders drop. Your neck releases. Your jaw unclenches. Your face softens completely.

You are drifting now. Floating on clouds of comfort. Safe. Warm. Peaceful.

There is nothing to do. Nowhere to be. Only rest. Only sleep.

Breathe... and drift... breathe... and drift...

Sleep now. Deep, restorative sleep. You deserve this rest.

Sweet dreams. Namaste.`,
        breathingPattern: { inhale: 4, hold: 2, exhale: 8 },
      },
      {
        id: 'energy-awakening',
        name: 'Energy Awakening',
        icon: 'bolt',
        description: 'Awaken your inner vitality with an energizing meditation that fills you with motivation and positive energy.',
        intention: 'Energy & Focus',
        environment: 'sunrise',
        visualPrompt: 'breathtaking sunrise over mountain valley, golden rays of light, morning mist, fresh dew on grass, vibrant colors, energizing atmosphere, photorealistic, 8k',
        script: `Welcome to your energy meditation. Sit tall. Feel alert. Let your eyes close with intention.

Take a powerful breath in... hold with strength... and release with purpose.

You stand on a hilltop as the sun begins to rise. The sky transforms from deep purple to orange to brilliant gold.

Breathe in energy... hold... breathe out stagnation.

Feel the first rays of sunlight touch your face. Warm. Vital. Alive. This light carries pure energy, and it's filling you now.

With each breath, feel your body awakening. Your spine straightens. Your shoulders open. Your chest expands.

Breathe deeply. In... hold... out with power.

Golden light pours into the crown of your head, flowing down through your entire body. Every cell is illuminated. Every fiber energized.

You are awake. You are strong. You are ready.

Breathe in motivation... hold... breathe out doubt.

The mist in the valley below begins to lift, just as fog lifts from your mind. Clarity arrives with the dawn.

Feel energy buzzing in your fingertips. Feel purpose humming in your heart. You have everything you need within you.

Breathe in possibility... hold... breathe out limitation.

You are the sunrise. You are new beginnings. You are unstoppable.

Take one final, powerful breath. Feel your energy peak. Open your eyes with fire and focus.

Go create something beautiful. Namaste.`,
        breathingPattern: { inhale: 4, hold: 2, exhale: 4 },
      },
    ];

    // Computed
    const backgroundStyle = computed(() => {
      if (imageSrc.value) {
        return {
          backgroundImage: `url(${imageSrc.value})`,
        };
      }
      return {};
    });
    const sessionProgress = computed(() => {
      if (!totalDuration.value) return meditationData.value ? 100 : 0;
      return Math.min(100, Math.round((elapsedTime.value / totalDuration.value) * 100));
    });

    // Fullscreen handling
    const toggleFullscreen = () => {
      if (!isFullscreen.value) {
        enterFullscreen();
      } else {
        exitFullscreen();
      }
    };

    const enterFullscreen = () => {
      const el = meditationDisplay.value;
      if (el) {
        if (el.requestFullscreen) {
          el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        } else if (el.msRequestFullscreen) {
          el.msRequestFullscreen();
        }
      }
      isFullscreen.value = true;
    };

    const exitFullscreen = () => {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
      isFullscreen.value = false;
    };

    const handleFullscreenChange = () => {
      isFullscreen.value = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );
    };

    const handleKeydown = (e) => {
      if (e.key === 'Escape' && isFullscreen.value) {
        // Browser handles ESC for fullscreen, but we need to update state
        isFullscreen.value = false;
      }
    };

    // Methods
    const selectScenario = (scenario) => {
      selectedScenario.value = scenario;
      meditationData.value = null;
      audioSrc.value = '';
      imageSrc.value = '';
      audioEnded.value = false;
    };

    const generateMeditation = async () => {
      if (!selectedScenario.value) return;
      if (!isDevMode() && !(await hasPurchasedSkill(SKILL_ID))) {
        console.warn('[MeditationForge] Skill not purchased — execution blocked.');
        return;
      }

      isGenerating.value = true;
      generationProgress.value = 0;
      emit('status-update', 'Starting meditation generation...');

      try {
        const scenario = selectedScenario.value;
        const port = window.BONZAI_SERVER_PORT || 65000;

        // Step 1: Generate dynamic meditation script with LLM
        generationStatus.value = 'Writing meditation script...';
        generationProgress.value = 10;
        emit('status-update', generationStatus.value);

        const scriptPrompt = `Write a guided meditation script for: "${scenario.name}"
Theme: ${scenario.intention}
Environment: ${scenario.environment}
Description: ${scenario.description}

Requirements:
- About 400-500 words
- Include breathing cues: "breathe in... hold... breathe out"
- Use sensory descriptions (sight, sound, touch, smell)
- Gentle, calming ASMR-style tone
- Start with "Welcome to your meditation" and end with "Namaste"
- Include progressive relaxation

Output ONLY the meditation script text, nothing else.`;

        let meditation = {
          title: `${scenario.name} Meditation`,
          script: scenario.script, // Default fallback
          breathingPattern: scenario.breathingPattern,
        };

        try {
          // Load LLM model
          await loadLLM();

          // Generate meditation script using the chat API
          const llmResponse = await window.electronAPI.chat(scriptPrompt);
          if (llmResponse && llmResponse.length > 200) {
            meditation.script = llmResponse.trim();
            console.log('[MeditationForge] LLM generated script, length:', meditation.script.length);
          } else {
            console.warn('[MeditationForge] LLM response too short, using fallback');
          }

          // Unload LLM to free memory for image/audio generation
          await unloadLLM();
        } catch (llmError) {
          console.warn('[MeditationForge] LLM call failed, using fallback script:', llmError);
        }

        generationStatus.value = 'Creating calming visuals...';
        generationProgress.value = 40;
        emit('status-update', generationStatus.value);

        // Get auth headers for API calls
        const authHeaders = getAuthHeaders();
        const headers = {
          'Content-Type': 'application/json',
          ...authHeaders,
        };
        // Generate calming image with FLUX Klein
        try {
          const imageResponse = await fetch(`http://localhost:${port}/image/turbo`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              prompt: scenario.visualPrompt,
              negative_prompt: 'text, watermark, low quality, blurry, distorted, ugly, harsh, scary, people, person, face',
              width: 1280,
              height: 720,
              steps: 4,
              guidance_scale: 3.5,
            }),
          });

          if (imageResponse.ok) {
            const imageData = await imageResponse.json();
            console.log('[MeditationForge] Image response:', Object.keys(imageData));
            if (imageData.image_base64) {
              imageSrc.value = `data:image/png;base64,${imageData.image_base64}`;
              console.log('[MeditationForge] Image set, length:', imageData.image_base64.length);
            } else if (imageData.image) {
              imageSrc.value = `data:image/png;base64,${imageData.image}`;
              console.log('[MeditationForge] Image set from "image" field');
            }
          } else {
            const errData = await imageResponse.json().catch(() => ({}));
            console.warn('[MeditationForge] Image generation failed:', imageResponse.status, errData);
          }
        } catch (imgError) {
          console.warn('[MeditationForge] Image generation error:', imgError);
        }

        generationStatus.value = 'Recording ASMR narration...';
        generationProgress.value = 70;
        emit('status-update', generationStatus.value);

        // Generate ASMR narration with Kokoro TTS
        try {
          const audioResponse = await fetch(`http://localhost:${port}/audio/turbo`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              prompt: meditation.script,
              voice: 'af_nicole',
              speed: 0.85,
            }),
          });

          if (audioResponse.ok) {
            const audioData = await audioResponse.json();
            if (audioData.audio_path) {
              audioSrc.value = `http://localhost:${port}/media/stream?path=${encodeURIComponent(audioData.audio_path)}`;
            } else if (audioData.audio_base64) {
              audioSrc.value = `data:audio/wav;base64,${audioData.audio_base64}`;
            }
            console.log('[MeditationForge] Audio generated successfully:', audioSrc.value);
          } else {
            const errorData = await audioResponse.json().catch(() => ({}));
            console.warn('[MeditationForge] Audio generation failed:', audioResponse.status, errorData);
          }
        } catch (audioError) {
          console.warn('[MeditationForge] Audio generation error:', audioError);
        }

        generationProgress.value = 100;
        generationStatus.value = 'Meditation ready!';

        // Store meditation data
        meditationData.value = {
          ...meditation,
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          createdAt: new Date().toISOString(),
        };

        // Add to history (store metadata only, not large base64 data)
        // Audio/image would need to be regenerated when loading a session
        const sessionId = `meditation-${Date.now()}`;
        sessionHistory.value.unshift({
          id: sessionId,
          title: meditationData.value.title,
          scenarioId: meditationData.value.scenarioId,
          scenarioName: meditationData.value.scenarioName,
          duration: meditationData.value.duration,
          voice: meditationData.value.voice,
          createdAt: meditationData.value.createdAt,
          // Don't store large base64 data - store indicator that media exists
          hasAudio: !!audioSrc.value,
          hasImage: !!imageSrc.value,
        });

        // Keep only last 10 sessions
        if (sessionHistory.value.length > 10) {
          sessionHistory.value = sessionHistory.value.slice(0, 10);
        }

        // Save immediately after adding
        await saveSessionHistory();

        emit('meditation-created', meditationData.value);

      } catch (error) {
        console.error('[MeditationForge] Generation error:', error);
        generationStatus.value = `Error: ${error.message}`;
      } finally {
        isGenerating.value = false;
      }
    };

    const playMeditation = () => {
      if (!meditationData.value || !audioPlayer.value) return;

      isPlaying.value = true;
      audioEnded.value = false;
      audioPlayer.value.volume = volume.value;
      audioPlayer.value.play();

      // Enter fullscreen when starting
      enterFullscreen();

      // Start breathing animation
      startBreathingAnimation();
    };

    const pauseMeditation = () => {
      if (audioPlayer.value) {
        audioPlayer.value.pause();
      }
      isPlaying.value = false;
      stopBreathingAnimation();
    };

    const resetMeditation = () => {
      if (audioPlayer.value) {
        audioPlayer.value.pause();
        audioPlayer.value.currentTime = 0;
      }
      isPlaying.value = false;
      audioEnded.value = false;
      elapsedTime.value = 0;
      stopBreathingAnimation();

      // Exit fullscreen when ending
      if (isFullscreen.value) {
        exitFullscreen();
      }
    };

    const startBreathingAnimation = () => {
      const pattern = meditationData.value?.breathingPattern || { inhale: 4, hold: 4, exhale: 6 };
      let phase = 'inhale';
      let counter = 0;

      breathingInterval = setInterval(() => {
        counter++;

        if (phase === 'inhale' && counter >= pattern.inhale) {
          phase = 'hold';
          counter = 0;
          breathingPhase.value = 'hold';
          breathingText.value = 'Hold';
        } else if (phase === 'hold' && counter >= pattern.hold) {
          phase = 'exhale';
          counter = 0;
          breathingPhase.value = 'exhale';
          breathingText.value = 'Breathe Out';
        } else if (phase === 'exhale' && counter >= pattern.exhale) {
          phase = 'inhale';
          counter = 0;
          breathingPhase.value = 'inhale';
          breathingText.value = 'Breathe In';
        }
      }, 1000);
    };

    const stopBreathingAnimation = () => {
      if (breathingInterval) {
        clearInterval(breathingInterval);
        breathingInterval = null;
      }
      breathingPhase.value = 'inhale';
      breathingText.value = 'Breathe In';
    };

    const onAudioEnded = () => {
      isPlaying.value = false;
      audioEnded.value = true;
      stopBreathingAnimation();

      // Exit fullscreen when audio ends
      if (isFullscreen.value) {
        exitFullscreen();
      }
    };

    const onTimeUpdate = () => {
      if (audioPlayer.value) {
        elapsedTime.value = audioPlayer.value.currentTime;
      }
    };

    const onAudioLoaded = () => {
      if (audioPlayer.value) {
        totalDuration.value = audioPlayer.value.duration;
      }
    };

    const updateVolume = () => {
      if (audioPlayer.value) {
        audioPlayer.value.volume = volume.value;
      }
    };

    const formatDate = (dateStr) => {
      return new Date(dateStr).toLocaleDateString();
    };

    const getScenarioIcon = (scenarioId) => {
      const scenario = scenarios.find(s => s.id === scenarioId);
      return scenario?.icon || 'spa';
    };

    const loadSession = (session) => {
      const scenario = scenarios.find(s => s.id === session.scenarioId);
      if (scenario) {
        selectedScenario.value = scenario;
        meditationData.value = {
          ...session,
          // Note: Audio and image are not stored to save space
        };
        // Clear media - user would need to regenerate the meditation
        audioSrc.value = '';
        imageSrc.value = '';
        audioEnded.value = false;
        console.log('[MeditationForge] Loaded session metadata. Click "Begin Session" to regenerate.');
      }
    };

    const deleteSession = (sessionId, event) => {
      // Stop event propagation to prevent loadSession from being triggered
      event.stopPropagation();
      sessionHistory.value = sessionHistory.value.filter(s => s.id !== sessionId);
      // If we deleted the currently loaded session, clear it
      if (meditationData.value?.id === sessionId) {
        meditationData.value = null;
        audioSrc.value = '';
        imageSrc.value = '';
      }
    };

    // Persist session history to storage
    const saveSessionHistory = async () => {
      try {
        if (window.electronAPI?.store?.set) {
          // Only store metadata, not large media data
          const dataToStore = sessionHistory.value.map(session => ({
            id: session.id,
            title: session.title,
            scenarioId: session.scenarioId,
            scenarioName: session.scenarioName,
            duration: session.duration,
            voice: session.voice,
            createdAt: session.createdAt,
            hasAudio: session.hasAudio,
            hasImage: session.hasImage,
          }));
          await window.electronAPI.store.set(STORAGE_KEY, dataToStore);
          console.log(`[MeditationForge] Saved ${dataToStore.length} sessions`);
        }
      } catch (e) {
        console.error('[MeditationForge] Failed to save session history:', e);
      }
    };

    // Load session history from storage
    const loadSessionHistory = async () => {
      try {
        const saved = await window.electronAPI?.store?.get(STORAGE_KEY, []);
        if (Array.isArray(saved) && saved.length > 0) {
          sessionHistory.value = saved;
        }
      } catch (e) {
        console.warn('[MeditationForge] Failed to load session history:', e);
      }
    };

    // Watch for changes and persist
    watch(sessionHistory, saveSessionHistory, { deep: true });

    // Lifecycle
    onMounted(() => {
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.addEventListener('keydown', handleKeydown);
      // Load saved session history
      loadSessionHistory();
    });

    onUnmounted(() => {
      stopBreathingAnimation();
      if (audioPlayer.value) {
        audioPlayer.value.pause();
      }
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeydown);
    });

    return {
      // Refs
      audioPlayer,
      meditationDisplay,
      // State
      scenarios,
      selectedScenario,
      isGenerating,
      isPlaying,
      isFullscreen,
      audioEnded,
      generationStatus,
      generationProgress,
      meditationData,
      audioSrc,
      imageSrc,
      volume,
      elapsedTime,
      totalDuration,
      breathingPhase,
      breathingText,
      sessionHistory,
      // Computed
      backgroundStyle,
      sessionProgress,
      // Methods
      selectScenario,
      generateMeditation,
      playMeditation,
      pauseMeditation,
      resetMeditation,
      toggleFullscreen,
      updateVolume,
      formatDate,
      getScenarioIcon,
      loadSession,
      deleteSession,
      onAudioEnded,
      onTimeUpdate,
      onAudioLoaded,
    };
  },
};
</script>

<style scoped>
.meditation-skill {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-5);
  color: var(--bz-fg);
}
.skill-panel {
  padding: var(--bz-space-5);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
}
.skill-title-row {
  display: flex;
  align-items: flex-start;
  gap: var(--bz-space-4);
}
.skill-title-icon {
  color: var(--bz-purple-300);
  font-size: 42px !important;
  line-height: 1;
}
.skill-section-title {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  margin: 0 0 var(--bz-space-4);
  color: var(--bz-fg);
}
.scenario-notice { margin-top: var(--bz-space-4); }
.scenario-tags,
.skill-action-row,
.volume-row,
.session-card-row {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  flex-wrap: wrap;
}
.skill-chip {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  color: var(--bz-fg-mid);
  background: var(--bz-canvas);
  font-size: var(--bz-size-meta);
}
.meditation-status,
.meditation-ready-title,
.breathing-text {
  margin-top: var(--bz-space-4);
  color: var(--bz-fg);
}
.volume-row { margin-top: var(--bz-space-4); justify-content: center; }
.volume-icon { color: var(--bz-fg-mid); }
.volume-slider { min-width: 260px; flex: 0 1 360px; }
.skill-range {
  -webkit-appearance: none;
  width: 100%;
  height: 8px;
  border-radius: var(--bz-r-pill);
  background: var(--bz-border-strong);
  outline: none;
}
.skill-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: var(--bz-r-pill);
  background: var(--bz-purple-300);
  border: 2px solid var(--bz-fg);
  cursor: pointer;
}
.session-card-row { width: 100%; flex-wrap: nowrap; }
.session-card-body { flex: 1; min-width: 0; }
.session-card-icon { color: var(--bz-purple-100); }
.session-card-title {
  margin: 0;
  color: var(--bz-fg);
  overflow-wrap: anywhere;
}
.session-card-meta { margin: var(--bz-space-1) 0 0; }
.danger-icon { color: var(--bz-danger); }


/* Selector styles matching Browse tab */
.category-selector {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5em;
}

@media (max-width: 768px) {
  .category-selector {
    grid-template-columns: repeat(2, 1fr);
  }
}

.category-selector input[type='radio'] {
  display: none;
}

.category-selector input[type='radio'] + label.radio.category {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  font-family: 'Fira Sans', sans-serif;
  font-weight: 600;
  font-size: 14px;
  background: transparent;
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  color: var(--bz-fg-faint);
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.category-selector input[type='radio'] + label.radio.category:hover {
  background: var(--bz-purple-soft);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg-mid);
}

.category-selector input[type='radio']:checked + label.radio.category {
  color: var(--bz-fg);
  border: 1px solid var(--bz-fg);
  background: var(--bz-purple-soft);
}

/* Meditation Display Area */
.meditation-display {
  position: relative;
  width: 100%;
  height: 500px;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, var(--bz-card) 0%, #16213e 50%, #0f3460 100%);
  transition: all 0.5s ease;
}

.meditation-display.is-active {
  box-shadow: 0 0 60px var(--bz-purple-soft);
}

.meditation-display.is-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  border-radius: 0;
  z-index: 9999;
}

.meditation-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  transition: opacity 1s ease;
}

/* Ken Burns Effect */
.meditation-background.ken-burns {
  animation: kenBurns 30s ease-in-out infinite alternate;
}

@keyframes kenBurns {
  0% {
    transform: scale(1) translate(0, 0);
  }
  25% {
    transform: scale(1.1) translate(-2%, -1%);
  }
  50% {
    transform: scale(1.15) translate(-1%, 2%);
  }
  75% {
    transform: scale(1.1) translate(2%, -2%);
  }
  100% {
    transform: scale(1.2) translate(-3%, 1%);
  }
}

.meditation-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    to bottom,
    var(--bz-scrim) 0%,
    var(--bz-scrim-soft) 50%,
    var(--bz-scrim) 100%
  );
}

.meditation-content {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
}

.meditation-loading,
.meditation-idle,
.meditation-playing,
.meditation-completed {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

/* Fullscreen Toggle Button */
.fullscreen-toggle {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  z-index: 20;
  background: var(--bz-scrim-strong);
  border: 1px solid var(--bz-fg-faint);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--bz-fg);
}

.fullscreen-toggle:hover {
  background: var(--bz-border-brand);
  border-color: var(--bz-fg-mid);
}

.fullscreen-toggle.fullscreen-offset {
  bottom: 1.25rem;
  right: 1.25rem;
}

/* Breathing Circle Animation */
.breathing-circle {
  width: 150px;
  height: 150px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bz-purple-soft);
  border: 3px solid var(--bz-fg-low);
  transition: all 0.5s ease;
}

.breathing-circle.inhale {
  transform: scale(1.3);
  background: rgba(100, 200, 150, 0.4);
  border-color: rgba(100, 200, 150, 0.8);
}

.breathing-circle.hold {
  transform: scale(1.3);
  background: rgba(200, 180, 100, 0.4);
  border-color: rgba(200, 180, 100, 0.8);
}

.breathing-circle.exhale {
  transform: scale(1);
  background: rgba(100, 150, 200, 0.4);
  border-color: rgba(100, 150, 200, 0.8);
}

.breathing-text {
  text-shadow: 0 2px 10px var(--bz-scrim-strong);
}

/* Controls */
.meditation-controls {
  text-align: center;
}

.volume-control input[type='range'] {
  -webkit-appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: var(--bz-border-strong);
  outline: none;
}

.volume-control input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--bz-purple-500);
  cursor: pointer;
}

/* Session History */
.session-card {
  background: var(--bz-scrim);
  border-radius: 8px;
  border: 1px solid var(--bz-border);
  cursor: pointer;
  transition: all 0.2s ease;
}

.session-card:hover {
  background: var(--bz-purple-soft);
  border-color: var(--bz-fg-faint);
}

/* Common Styles */
.models__activity--payouts {
  padding: 2em;
  border: 1px solid var(--bz-border);
  border-radius: 4px !important;
}

.skill-name {
  font-size: 1.5rem;
  margin: 0;
  font-family: 'Fira Sans Condensed', sans-serif;
  font-style: italic;
  font-weight: 900;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}

.has-text-brand {
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}

.skill-description {
  color: var(--bz-fg-mid);
  margin-bottom: 0.5em;
  text-align: left;
}

.rotating {
  animation: bz-spin 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Progress bar styling */
.progress {
  background-color: var(--bz-border-strong);
}

.progress::-webkit-progress-value {
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51));
  transition: width 0.3s ease;
}

.tag.is-dark {
  text-transform: uppercase;
}

/* Agentic redesign: Session Forge */
.meditation-journey-panel {
  background:
    linear-gradient(135deg, rgba(24, 144, 255, 0.12), transparent 46%),
    var(--bz-panel);
}
.meditation-journey-panel .category-selector {
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}
.meditation-journey-panel label.radio.category {
  min-height: 74px;
  justify-content: flex-start !important;
  gap: var(--bz-space-2);
  text-align: left;
}
.meditation-stage {
  min-height: clamp(460px, 55vh, 720px);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r);
}
.meditation-stage::after {
  content: '';
  position: absolute;
  inset: var(--bz-space-3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: calc(var(--bz-r) - 2px);
  pointer-events: none;
}
.meditation-console {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 0.5fr);
  gap: var(--bz-space-4);
  align-items: center;
  background: var(--bz-panel);
}
.meditation-console .skill-action-row {
  justify-content: flex-start;
}
.meditation-console .volume-row {
  justify-content: flex-end;
  margin-top: 0;
}
.meditation-history .session-card {
  padding: var(--bz-space-3);
}
@media (max-width: 900px) {
  .meditation-console {
    grid-template-columns: 1fr;
  }
  .meditation-console .volume-row {
    justify-content: flex-start;
  }
}


/* Signature upgrade: meditation session instrument */
.meditation-session-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(130px, 1fr));
  gap: var(--bz-space-3);
}
.meditation-session-cell {
  min-height: 82px;
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background:
    linear-gradient(135deg, rgba(24, 144, 255, 0.1), transparent 55%),
    var(--bz-panel);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.meditation-session-cell span {
  color: var(--bz-fg-low);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.meditation-session-cell strong {
  color: var(--bz-fg);
  font-size: 18px;
  line-height: 1.15;
  overflow-wrap: anywhere;
}
.meditation-journey-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.42fr);
  gap: var(--bz-space-4);
  align-items: stretch;
}
.meditation-journey-panel > div:first-child,
.meditation-journey-panel .scenario-notice {
  min-width: 0;
}
@media (max-width: 980px) {
  .meditation-session-strip,
  .meditation-journey-panel { grid-template-columns: 1fr; }
}

</style>
