/**
 * BonzAI Skill Store (Pinia)
 *
 * Manages skill loading, purchasing, and execution state.
 * Integrates with skill.service.js for core functionality.
 * Level-based access: skills require appropriate level based on models used.
 *
 * Also manages global Autonomous Companion Mode that persists across views.
 */

import { defineStore } from 'pinia';
import { ref, computed, toRaw, watch } from 'vue';
import { skillService } from '../services/skill.service.js';
import { levelService } from '../services/level.service.js';
import { authService, isAuthenticated, refreshToken, reAuthenticate } from '../services/auth.service.js';
import { SKILL_CATEGORIES, SKILL_CATEGORY_META } from '../skills/types.js';
import { roleplayCompanion } from '../skills/flagship.js';
import { x402ExecutorService } from '../services/x402Executor.service.js';
import { purchaseExecutorService } from '../services/purchaseExecutor.service.js';
import { CONFIG } from '../config/web3.config.js';
import { ethers } from 'ethers';

// Parse a cost string (from LLM purchaseIntent) into an ETH amount
function parsePurchaseCost(costString) {
  if (!costString) return 0;
  const s = costString.toString().toLowerCase();
  const ethMatch = s.match(/([\d.]+)\s*eth/i);
  if (ethMatch) return parseFloat(ethMatch[1]) || 0;
  const usdMatch = s.match(/\$?([\d.]+)/);
  if (usdMatch) {
    const usd = parseFloat(usdMatch[1]) || 0;
    return usd > 0 ? usd / 2000 : 0;
  }
  return 0;
}

// Debounce helper for search performance
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export const useSkillStore = defineStore('skill', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════

  const isInitialized = ref(false);
  const isLoading = ref(false);
  const error = ref(null);

  // All loaded skills
  const skills = ref([]);

  // Currently running skill
  const runningSkill = ref(null);
  const runningStatus = ref('');
  const runningProgress = ref(0);

  // Execution history
  const executionHistory = ref([]);

  // Selected category filter
  const selectedCategory = ref(null);

  // Search query (user input) and debounced version for filtering
  const searchQuery = ref('');
  const debouncedSearchQuery = ref('');

  // Debounce search query updates for performance (150ms delay)
  const updateDebouncedSearch = debounce((value) => {
    debouncedSearchQuery.value = value;
  }, 150);

  // Watch searchQuery and update debounced version
  watch(searchQuery, (newValue) => {
    updateDebouncedSearch(newValue);
  });

  // Pending skill navigation (set when navigating from outside SmartAgent)
  const pendingSkillId = ref(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTONOMOUS COMPANION MODE (Global State)
  // Persists across views - companion continues generating while user navigates
  // ═══════════════════════════════════════════════════════════════════════════

  const autonomousMode = ref(false);
  const isIdle = ref(false);
  const missedMessages = ref(0);
  const lastActiveTime = ref(Date.now());
  const lastMousePosition = ref({ x: 0, y: 0 });
  const idleCheckInterval = ref(null);
  const autonomousInterval = ref(null);
  const isGeneratingAutonomous = ref(false);
  const autonomousMessageCount = ref(0); // Track how many autonomous messages generated

  // Configurable autonomous mode settings (defaults, can be overridden by session settings)
  const autonomousConfig = ref({
    idleTimeout: 5,           // Minutes before considering user idle
    messageInterval: 15,      // Minutes between autonomous messages
    maxMessages: 12,          // Max messages before stopping
  });

  // Computed timeouts in milliseconds (for internal use)
  const IDLE_TIMEOUT = computed(() => (autonomousConfig.value.idleTimeout || 5) * 60 * 1000);
  const AUTONOMOUS_MESSAGE_INTERVAL = computed(() => (autonomousConfig.value.messageInterval || 15) * 60 * 1000);
  const MAX_AUTONOMOUS_MESSAGES = computed(() => autonomousConfig.value.maxMessages || 12);

  const STORAGE_KEY = 'roleplaySessions';

  // Variety prompts for autonomous mode - cycles through different activities
  const AUTONOMOUS_ACTIVITIES = [
    { type: 'routine', prompt: 'doing something from their daily routine' },
    { type: 'explore', prompt: 'exploring a new area or discovering something interesting' },
    { type: 'hobby', prompt: 'engaging in one of their hobbies or interests' },
    { type: 'reflect', prompt: 'having a quiet moment of reflection or daydreaming' },
    { type: 'social', prompt: 'interacting with the environment or other characters in passing' },
    { type: 'adventure', prompt: 'getting into a small adventure or unexpected situation' },
    { type: 'creative', prompt: 'doing something creative or expressive' },
    { type: 'relax', prompt: 'relaxing or taking care of themselves' },
  ];

  // Moltbook state tracking (for autonomous Moltbook engagement)
  const moltbookState = ref({
    lastPostTime: 0,
    lastEngagementTime: 0,
    activityLog: [],  // { id, action, title, timestamp, postId? }
    engagedPosts: [],  // Array of post IDs we've already engaged with
  });

  // Full autonomous session state (persists across views)
  const autonomousSession = ref({
    sessionKey: null,
    companion: null,
    scenario: null,
    settings: null,
    history: [],
    sceneState: {
      lastImageAt: -3,
      currentLocation: '',
      recentEmotions: [],
      recentActions: [],
      lastOpeningPhrase: '',
    },
    backgroundImage: null,
    backgroundHistory: [], // Array of { messageIndex, image } for scroll-based background switching
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  // Categories with metadata
  const categories = computed(() => {
    return SKILL_CATEGORIES.map(key => ({
      key,
      ...SKILL_CATEGORY_META[key],
    }));
  });

  // Skills filtered by category
  const skillsByCategory = computed(() => {
    if (!selectedCategory.value) return skills.value;
    return skills.value.filter(s => s.category === selectedCategory.value);
  });

  // Skills filtered by search query (debounced), with featured skills first
  const filteredSkills = computed(() => {
    let result = skillsByCategory.value;

    // Use debounced search query for performance
    if (debouncedSearchQuery.value) {
      const query = debouncedSearchQuery.value.toLowerCase();
      result = result.filter(
        s =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query)
      );
    }

    // Sort: featured skills first, then alphabetically by name
    return [...result].sort((a, b) => {
      // Featured skills always come first
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      // Then sort alphabetically by name
      return a.name.localeCompare(b.name);
    });
  });

  // Skills by specific category
  const getSkillsByCategory = (category) => {
    return skills.value.filter(s => s.category === category);
  };

  // Get skill by ID
  const getSkillById = (skillId) => {
    return skills.value.find(s => s.id === skillId);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL-BASED ACCESS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get required level for a skill based on its requirements
   * Maps requiredApis to level:
   * - llm → LVL1
   * - audio → LVL2
   * - image → LVL3
   * - video → LVL4
   * - 3d/game → LVL5
   * - training → LVL6
   */
  const getRequiredLevel = (skill) => {
    // Use explicit minLevel if specified
    if (skill.requirements?.minLevel) {
      return `LVL${skill.requirements.minLevel}`;
    }

    // Fall back to inferring from requiredApis
    const apis = skill.requirements?.requiredApis || [];

    // Check from highest to lowest
    if (apis.includes('training') || apis.includes('robot')) return 'LVL6';
    if (apis.includes('3d') || apis.includes('game')) return 'LVL5';
    if (apis.includes('video')) return 'LVL4';
    if (apis.includes('image')) return 'LVL3';
    if (apis.includes('audio') || apis.includes('tts')) return 'LVL2';
    if (apis.includes('llm') || apis.includes('text')) return 'LVL1';

    return 'LVL1';
  };

  /**
   * Check if user can run a skill based on their level
   */
  // All skills are free — no level gating
  const canRunSkill = (skillId) => {
    const skill = getSkillById(skillId);
    if (!skill) return { canRun: false, reason: 'Skill not found' };
    const requiredLevel = getRequiredLevel(skill);
    return { canRun: true, requiredLevel };
  };

  /**
   * Get skills the user can currently access
   */
  const accessibleSkills = computed(() => {
    return skills.value.filter(skill => {
      const { canRun } = canRunSkill(skill.id);
      return canRun;
    });
  });

  /**
   * Get skills grouped by required level
   */
  const skillsByLevel = computed(() => {
    const grouped = {
      LVL1: [],
      LVL2: [],
      LVL3: [],
      LVL4: [],
      LVL5: [],
      LVL6: [],
    };

    skills.value.forEach(skill => {
      const level = getRequiredLevel(skill);
      if (grouped[level]) {
        grouped[level].push(skill);
      }
    });

    return grouped;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize the skill store
   */
  const initialize = async () => {
    if (isInitialized.value) return;

    isLoading.value = true;
    error.value = null;

    try {
      // Load all flagship skills
      const { skills: loadedSkills } = await skillService.initializeSkills();
      skills.value = [...loadedSkills];

      // Load user-created skills
      await loadUserSkills();

      // Load execution history
      await loadExecutionHistory();

      isInitialized.value = true;
      console.log(`[SkillStore] Initialized with ${skills.value.length} skills`);
    } catch (e) {
      console.error('[SkillStore] Initialization error:', e);
      error.value = e.message;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Load execution history from storage
   */
  const loadExecutionHistory = async () => {
    try {
      if (window.electronAPI?.store?.get) {
        const stored = await window.electronAPI.store.get('skillExecutionHistory', []);
        executionHistory.value = stored;
      }
    } catch (e) {
      console.warn('[SkillStore] Failed to load execution history:', e);
    }
  };

  /**
   * Save execution history to storage
   */
  const saveExecutionHistory = async () => {
    try {
      if (window.electronAPI?.store?.set) {
        // Keep only last 100 executions
        const recent = executionHistory.value.slice(-100);

        // Sanitize execution records to only store serializable metadata
        const sanitized = recent.map(record => ({
          skillId: record.skillId,
          skillName: record.skillName,
          startedAt: record.startedAt,
          completedAt: record.completedAt,
          status: record.status,
          error: record.error,
          requiredLevel: record.requiredLevel,
          resultSuccess: record.result?.success ?? record.status === 'completed',
        }));

        await window.electronAPI.store.set('skillExecutionHistory', sanitized);
      }
    } catch (e) {
      console.warn('[SkillStore] Failed to save execution history:', e);
    }
  };

  /**
   * Execute a skill (level-gated)
   */
  const executeSkill = async (skillId, inputs = {}) => {
    const skill = getSkillById(skillId);
    if (!skill) {
      return { success: false, error: 'Skill not found' };
    }

    // Check level access
    const accessCheck = canRunSkill(skillId);
    if (!accessCheck.canRun) {
      return {
        success: false,
        error: accessCheck.reason,
        requiresLevel: accessCheck.requiredLevel,
      };
    }

    runningSkill.value = skill;
    runningStatus.value = 'Starting...';
    runningProgress.value = 0;
    error.value = null;

    const executionRecord = {
      skillId,
      skillName: skill.name,
      inputs,
      startedAt: new Date().toISOString(),
      status: 'running',
      requiredLevel: accessCheck.requiredLevel,
    };

    try {
      runningStatus.value = 'Executing skill...';

      // Create execution context
      const context = {
        updateStatus: (status) => {
          runningStatus.value = status;
        },
        updateProgress: (progress) => {
          runningProgress.value = progress;
        },
        fetchTool: async (toolName, args) => {
          const tools = skillService.getSkillToolsForBonzai(skill);
          const tool = tools.find(t => t.name === toolName);
          if (tool) {
            return await skillService.executeBonzaiTool(tool, args);
          }
          throw new Error(`Tool not found: ${toolName}`);
        },
      };

      // Execute using skillService
      const executionResult = await skillService.executeSkill(skillId, inputs, context);

      if (!executionResult.success) {
        throw new Error(executionResult.error || 'Skill execution failed');
      }

      const result = executionResult.result;

      executionRecord.status = 'completed';
      executionRecord.result = result;
      executionRecord.completedAt = new Date().toISOString();
      executionHistory.value.push(executionRecord);
      await saveExecutionHistory();

      runningStatus.value = 'Complete!';
      runningProgress.value = 100;

      return {
        success: true,
        result,
      };
    } catch (e) {
      console.error('[SkillStore] Execution error:', e);

      executionRecord.status = 'failed';
      executionRecord.error = e.message;
      executionRecord.completedAt = new Date().toISOString();
      executionHistory.value.push(executionRecord);
      await saveExecutionHistory();

      error.value = e.message;
      runningStatus.value = `Error: ${e.message}`;

      return {
        success: false,
        error: e.message,
      };
    } finally {
      setTimeout(() => {
        runningSkill.value = null;
        runningStatus.value = '';
        runningProgress.value = 0;
      }, 3000);
    }
  };

  /**
   * Register a new skill
   */
  const registerSkill = (skillDefinition) => {
    const success = skillService.registerSkill(skillDefinition);
    if (success) {
      skills.value.push(skillDefinition);
    }
    return success;
  };

  /**
   * Publish/list a new skill
   */
  const publishSkill = async (skillForm) => {
    isLoading.value = true;
    error.value = null;

    try {
      // Generate skill ID
      const skillId = `${skillForm.name.toLowerCase().replace(/\s+/g, '-')}-v1.0.0-${Date.now()}`;

      // Determine required APIs based on skill steps
      const requiredApis = [];
      if (skillForm.usesLLM !== false) requiredApis.push('llm');
      if (skillForm.usesImage) requiredApis.push('image');
      if (skillForm.usesAudio) requiredApis.push('audio');
      if (skillForm.usesVideo) requiredApis.push('video');

      // Create skill definition
      const skillDefinition = {
        schema_version: '1.0.0',
        id: skillId,
        name: skillForm.name,
        description: skillForm.description,
        version: '1.0.0',
        author: {
          address: '0x0000000000000000000000000000000000000000',
          name: 'User',
          verified: false,
        },
        category: skillForm.category || 'finance',
        requirements: {
          minLevel: 1,
          requiredApis,
          requiredPermissions: [],
        },
        inputs: {},
        prompt: {
          system: 'You are a helpful AI assistant.',
          task: skillForm.steps?.map(s => s.prompt).join('\n\n') || '',
          outputFormat: { type: 'text' },
        },
        tools: { bonzai: [], mcp: [] },
        execution: {
          type: 'javascript',
          entrypoint: 'execute',
          steps: skillForm.steps || [],
          async execute(inputs, context) {
            context.updateStatus?.('Executing user skill...');
            return { success: true, message: 'User skill executed' };
          },
        },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          license: 'MIT',
          mock: true,
        },
      };

      // Register in skill service cache
      skillService.registerSkill(skillDefinition);

      // Add to local skills list
      skills.value.push(skillDefinition);

      // Save user-created skills to storage
      await saveUserSkills();

      console.log('[SkillStore] Published skill:', skillDefinition.name, skillId);

      return {
        success: true,
        skillId,
        skill: skillDefinition,
      };
    } catch (e) {
      console.error('[SkillStore] Publish error:', e);
      error.value = e.message;
      return { success: false, error: e.message };
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Save user-created skills to storage
   */
  const saveUserSkills = async () => {
    try {
      if (window.electronAPI?.store?.set) {
        const userSkills = skills.value.filter(s => s.metadata?.mock);
        await window.electronAPI.store.set('userCreatedSkills', userSkills);
      }
    } catch (e) {
      console.warn('[SkillStore] Failed to save user skills:', e);
    }
  };

  /**
   * Load user-created skills from storage
   */
  const loadUserSkills = async () => {
    try {
      if (window.electronAPI?.store?.get) {
        const userSkills = await window.electronAPI.store.get('userCreatedSkills', []);
        if (userSkills.length > 0) {
          userSkills.forEach(skill => {
            if (!skills.value.find(s => s.id === skill.id)) {
              skillService.registerSkill(skill);
              skills.value.push(skill);
            }
          });
          console.log(`[SkillStore] Loaded ${userSkills.length} user-created skills`);
        }
      }
    } catch (e) {
      console.warn('[SkillStore] Failed to load user skills:', e);
    }
  };

  /**
   * Set category filter
   */
  const setCategory = (category) => {
    selectedCategory.value = category;
  };

  /**
   * Set search query
   */
  const setSearchQuery = (query) => {
    searchQuery.value = query;
  };

  /**
   * Clear filters
   */
  const clearFilters = () => {
    selectedCategory.value = null;
    searchQuery.value = '';
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTONOMOUS COMPANION MODE ACTIONS
  // Full standalone implementation - works even when RoleplayChat is unmounted
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Clean roleplay response by removing metadata labels and companion name prefixes.
   * Extracts only the narrative text, removing "Emotion:", "Action:", and "CompanionName:" prefixes.
   *
   * @param {string} text - Raw response text from LLM
   * @param {string} companionName - Name of the companion to strip as prefix
   * @returns {string} Cleaned narrative text
   */
  const cleanRoleplayResponse = (text, companionName) => {
    if (!text) return '';

    const lines = text.split('\n');
    const cleanedParts = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) {
        // Preserve paragraph breaks
        if (cleanedParts.length > 0 && cleanedParts[cleanedParts.length - 1] !== '') {
          cleanedParts.push('');
        }
        continue;
      }

      // Skip lines that are purely metadata (Emotion: or Action:)
      if (/^Emotion:\s*/i.test(trimmedLine) || /^Action:\s*/i.test(trimmedLine)) {
        continue;
      }

      // Remove companion name prefix if present (e.g., "Mai: " or "CompanionName: ")
      let cleanedLine = trimmedLine;
      if (companionName) {
        const companionPrefixRegex = new RegExp(`^${companionName}:\\s*`, 'i');
        cleanedLine = cleanedLine.replace(companionPrefixRegex, '');
      }

      // Also handle generic "Companion:" prefix
      cleanedLine = cleanedLine.replace(/^Companion:\s*/i, '');

      // Only add non-empty lines after cleaning
      if (cleanedLine.trim()) {
        cleanedParts.push(cleanedLine);
      }
    }

    // Remove trailing empty strings and join
    while (cleanedParts.length > 0 && cleanedParts[cleanedParts.length - 1] === '') {
      cleanedParts.pop();
    }

    return cleanedParts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  /**
   * Update last active time (called on user activity)
   */
  const updateActivity = () => {
    lastActiveTime.value = Date.now();
    if (isIdle.value) {
      isIdle.value = false;
    }
  };

  /**
   * Track mouse movement for activity detection
   */
  const onMouseMove = (e) => {
    const pos = lastMousePosition.value;
    if (Math.abs(e.clientX - pos.x) > 5 || Math.abs(e.clientY - pos.y) > 5) {
      lastMousePosition.value = { x: e.clientX, y: e.clientY };
      updateActivity();
    }
  };

  /**
   * Check if user is idle
   */
  const checkIdle = () => {
    if (!autonomousMode.value) return;

    const timeSinceActive = Date.now() - lastActiveTime.value;
    const wasIdle = isIdle.value;
    const hasFocus = document.hasFocus();

    // Consider idle if: window not focused, or no activity for IDLE_TIMEOUT
    isIdle.value = !hasFocus || timeSinceActive > IDLE_TIMEOUT.value;

    if (isIdle.value && !wasIdle) {
      console.log(`[SkillStore] User became idle (focus: ${hasFocus}, inactive: ${Math.round(timeSinceActive/1000)}s)`);
    } else if (!isIdle.value && wasIdle) {
      console.log('[SkillStore] User became active');
    }
  };

  /**
   * Save autonomous session to storage
   */
  const saveAutonomousSession = async () => {
    const session = autonomousSession.value;
    if (!session.sessionKey || session.history.length === 0) return;

    try {
      if (window.electronAPI?.store?.get && window.electronAPI?.store?.set) {
        const allSessions = await window.electronAPI.store.get(STORAGE_KEY, {});

        // Create plain session object
        const plainSession = {
          companion: JSON.parse(JSON.stringify(toRaw(session.companion))),
          scenario: JSON.parse(JSON.stringify(toRaw(session.scenario))),
          settings: JSON.parse(JSON.stringify(toRaw(session.settings))),
          history: session.history.map(msg => JSON.parse(JSON.stringify(toRaw(msg)))),
          sceneState: JSON.parse(JSON.stringify(toRaw(session.sceneState))),
          backgroundImage: session.backgroundImage,
          // Save background history for scroll-based switching
          backgroundHistory: session.backgroundHistory ? session.backgroundHistory.map(entry => ({
            messageIndex: entry.messageIndex,
            image: entry.image,
            location: entry.location,
          })) : [],
          updatedAt: Date.now(),
        };

        allSessions[session.sessionKey] = plainSession;
        await window.electronAPI.store.set(STORAGE_KEY, allSessions);
        console.log(`[SkillStore] Autonomous session saved: ${session.history.length} messages`);
      }
    } catch (e) {
      console.error('[SkillStore] Failed to save autonomous session:', e);
    }
  };

  /**
   * Generate autonomous companion message (standalone - no component needed)
   */
  const generateAutonomousMessage = async () => {
    // Guard checks with detailed logging
    if (!autonomousMode.value) {
      return;
    }
    if (!isIdle.value) {
      console.log('[SkillStore] Skipping autonomous generation - user is not idle');
      return;
    }
    if (isGeneratingAutonomous.value) {
      console.log('[SkillStore] Skipping autonomous generation - already generating');
      return;
    }

    // Check if we've reached the max autonomous messages
    if (autonomousMessageCount.value >= MAX_AUTONOMOUS_MESSAGES.value) {
      console.log('[SkillStore] Reached max autonomous messages, stopping');
      stopAutonomousMode();
      return;
    }

    // Check if user came back
    if (document.hasFocus() && Date.now() - lastActiveTime.value < IDLE_TIMEOUT.value) {
      console.log('[SkillStore] Skipping autonomous generation - user came back');
      return;
    }

    const session = autonomousSession.value;
    if (!session.companion || !session.scenario) {
      console.log('[SkillStore] No active autonomous session - companion:', !!session.companion, 'scenario:', !!session.scenario);
      return;
    }

    // Ensure authentication is valid before generating (tokens may have expired during idle)
    // This is critical because setTimeout can be unreliable when system is idle/sleeping
    // IMPORTANT: We NEVER request wallet signatures automatically - this breaks autonomous mode
    if (!isAuthenticated()) {
      console.log('[SkillStore] Token expired during idle, attempting refresh...');
      try {
        await refreshToken();
        console.log('[SkillStore] Token refreshed successfully');
      } catch (refreshError) {
        // Token refresh failed - PAUSE autonomous mode until user re-authenticates
        // We don't fall back to demo mode - autonomous mode requires full auth
        console.log('[SkillStore] Token refresh failed - pausing autonomous mode');
        console.log('[SkillStore] User must manually re-authenticate to resume');

        // Notify user that re-auth is needed
        window.dispatchEvent(new CustomEvent('auth:needs-reauth'));

        // Pause autonomous mode (keep the session, just stop generating)
        // The timer will continue checking, but we'll skip generation until auth is restored
        isGeneratingAutonomous.value = false;
        return;
      }
    }

    isGeneratingAutonomous.value = true;
    const msgNum = autonomousMessageCount.value + 1;
    console.log(`[SkillStore] Generating autonomous message #${msgNum} for ${session.companion.name}...`);

    try {
      // Pick a varied activity based on message count to ensure variety
      const activityIndex = autonomousMessageCount.value % AUTONOMOUS_ACTIVITIES.length;
      const activity = AUTONOMOUS_ACTIVITIES[activityIndex];

      // Force location change every 3-4 messages
      const shouldChangeLocation = autonomousMessageCount.value > 0 && autonomousMessageCount.value % 3 === 0;

      // Build a rich autonomous prompt that encourages story progression
      // This prompt is NOT added to the visible history
      const autonomousPrompt = `[AUTONOMOUS MODE - Time has passed since the user last interacted]

${session.companion.name} is ${activity.prompt}.
${shouldChangeLocation ? `IMPORTANT: ${session.companion.name} has moved to a NEW LOCATION different from "${session.sceneState.currentLocation}". Describe where they are now.` : ''}

REQUIREMENTS:
- Write what ${session.companion.name} is doing RIGHT NOW as if sending a message to catch up
- Be specific about actions, not generic
- Include sensory details (what they see, hear, feel)
- Show personality through their activity
- ${shouldChangeLocation ? 'MUST describe the new location they are in' : 'Can mention a different spot within the current area'}
- Avoid repeating previous activities: ${session.sceneState.recentActions?.slice(-3).join(', ') || 'none yet'}
- Keep it natural, like a text message update
- Set "shouldVisualize" to true to show what they're doing`;

      // Build responseMode from settings
      const responseMode = ['text'];
      if (session.settings.enableImage) responseMode.push('image');
      if (session.settings.enableAudio) responseMode.push('audio');
      // Skip video in autonomous mode to save resources
      // if (session.settings.enableVideo) responseMode.push('video');

      // Create execution context
      const context = {
        updateStatus: (status) => {
          runningStatus.value = status;
        },
        onProgress: null, // No streaming when running autonomously
      };

      // Call roleplayCompanion.execution.executeMessage
      // NOTE: We pass the prompt but DON'T add it to session.history (invisible prompt)
      const result = await roleplayCompanion.execution.executeMessage(
        {
          userMessage: autonomousPrompt,
          session: {
            companion: session.companion,
            scenario: session.scenario,
            history: session.history, // Full history without the autonomous prompt
          },
          settings: {
            contentLevel: session.settings.contentLevel,
            responseMode: responseMode.join('+'),
            autonomousMode: true, // Flag for special handling
            forceVisualize: true, // Always generate image in autonomous mode
            forceLocationChange: shouldChangeLocation,
          },
          sceneState: session.sceneState,
        },
        context
      );

      console.log('[SkillStore] Autonomous generation result:', result);

      // The result structure is: { success, character, response: {...}, sceneState, meta }
      const responseData = result.response || {};

      // Extract raw response text
      const rawResponseText = typeof responseData.response === 'string'
        ? responseData.response
        : (responseData.text || responseData.content || result.text || '');

      if (!rawResponseText) {
        console.warn('[SkillStore] No response text in result. responseData:', responseData);
        throw new Error('No response text generated');
      }

      // Clean the response to remove metadata labels and companion name prefixes
      const responseText = cleanRoleplayResponse(rawResponseText, session.companion?.name);
      console.log('[SkillStore] Cleaned response text:', responseText.substring(0, 100) + '...');

      // Update scene state
      const newSceneState = result.sceneState || {};
      if (newSceneState.currentLocation || responseData.newLocation) {
        session.sceneState.currentLocation = newSceneState.currentLocation || responseData.newLocation;
      }
      if (newSceneState.lastImageAt !== undefined) {
        session.sceneState.lastImageAt = newSceneState.lastImageAt;
      }
      if (responseData.emotion) {
        session.sceneState.recentEmotions = [
          ...session.sceneState.recentEmotions.slice(-2),
          responseData.emotion,
        ];
      }
      if (responseData.action) {
        session.sceneState.recentActions = [
          ...session.sceneState.recentActions.slice(-3),
          responseData.action,
        ];
      }
      if (responseText) {
        const firstWords = responseText.split(' ').slice(0, 3).join(' ');
        session.sceneState.lastOpeningPhrase = firstWords;
      }
      if (responseData.image) {
        session.sceneState.lastImageAt = session.history.length;
      }

      // Handle background image updates (from location changes)
      if (responseData.backgroundImage) {
        session.backgroundImage = responseData.backgroundImage;
        session.backgroundHistory = session.backgroundHistory || [];
        session.backgroundHistory.push({
          messageIndex: session.history.length,
          image: responseData.backgroundImage,
          location: responseData.newLocation || session.sceneState.currentLocation,
        });
        console.log(`[SkillStore] Background updated for location: ${responseData.newLocation || 'unknown'}`);
      }

      // Create assistant message (only the response, no fake user message)
      const assistantMsg = {
        role: 'assistant',
        content: responseText,
        emotion: responseData.emotion,
        action: responseData.action,
        image: responseData.image || null,
        images: responseData.images || null, // Support for batch images
        audio: responseData.audio || null,
        video: responseData.video || null,
        timestamp: Date.now(),
        isAutonomous: true,
        autonomousActivity: activity.type,
      };

      // Handle autonomous purchase intent
      if (responseData.purchaseIntent && session.settings.autonomous?.enablePurchases) {
        assistantMsg.purchaseIntent = responseData.purchaseIntent;
        const payResult = await purchaseExecutorService.executePurchase(
          session.companion.id,
          responseData.purchaseIntent,
          session.settings.autonomous,
          session.companion,
          session
        );
        assistantMsg.purchaseApproved = true;
        assistantMsg.purchaseExecuted = payResult.success;
        assistantMsg.purchaseTxHash = payResult.txHash || null;
        assistantMsg.purchaseType = payResult.type || null;
        assistantMsg.purchaseDetails = payResult.details || null;
      }

      session.history.push(assistantMsg);
      missedMessages.value++;
      autonomousMessageCount.value++;

      // Save session to storage
      await saveAutonomousSession();

      console.log(`[SkillStore] Autonomous message #${msgNum} generated: "${responseText?.substring(0, 50)}..." (activity: ${activity.type})`);
    } catch (e) {
      console.error('[SkillStore] Autonomous message generation failed:', e);
    } finally {
      isGeneratingAutonomous.value = false;
      runningStatus.value = '';
    }
  };

  /**
   * Start autonomous session with companion data
   * Called by RoleplayChat when enabling autonomous mode
   */
  const startAutonomousSession = (sessionData) => {
    autonomousSession.value = {
      sessionKey: sessionData.sessionKey,
      companion: sessionData.companion,
      scenario: sessionData.scenario,
      settings: sessionData.settings,
      history: [...sessionData.history],
      sceneState: { ...sessionData.sceneState },
      backgroundImage: sessionData.backgroundImage,
      backgroundHistory: sessionData.backgroundHistory ? [...sessionData.backgroundHistory] : [],
    };

    // Apply autonomous settings from session if provided
    const autoSettings = sessionData.settings?.autonomous;
    if (autoSettings) {
      autonomousConfig.value = {
        idleTimeout: autoSettings.idleTimeout || 5,
        messageInterval: autoSettings.messageInterval || 15,
        maxMessages: autoSettings.maxMessages || 12,
      };
      console.log(`[SkillStore] Autonomous config updated: idle=${autonomousConfig.value.idleTimeout}min, interval=${autonomousConfig.value.messageInterval}min, max=${autonomousConfig.value.maxMessages}`);
    }

    console.log(`[SkillStore] Autonomous session started: ${sessionData.companion?.name} in ${sessionData.scenario?.name}`);
  };

  /**
   * Sync history from RoleplayChat (when user sends a message while on the view)
   * @param {Array} history - Chat history
   * @param {Object} sceneState - Scene state
   * @param {string} backgroundImage - Current background image
   * @param {Array} backgroundHistory - Background history for scroll-based switching
   */
  const syncAutonomousHistory = (history, sceneState, backgroundImage = null, backgroundHistory = null) => {
    if (autonomousSession.value.sessionKey) {
      autonomousSession.value.history = [...history];
      if (sceneState) {
        autonomousSession.value.sceneState = { ...sceneState };
      }
      if (backgroundImage !== null) {
        autonomousSession.value.backgroundImage = backgroundImage;
      }
      if (backgroundHistory !== null) {
        autonomousSession.value.backgroundHistory = [...backgroundHistory];
      }
    }
  };

  /**
   * Get current autonomous session history (for RoleplayChat to sync when mounting)
   */
  const getAutonomousSessionData = () => {
    return {
      sessionKey: autonomousSession.value.sessionKey,
      history: [...autonomousSession.value.history],
      sceneState: { ...autonomousSession.value.sceneState },
      backgroundImage: autonomousSession.value.backgroundImage,
      backgroundHistory: autonomousSession.value.backgroundHistory ? [...autonomousSession.value.backgroundHistory] : [],
    };
  };

  /**
   * Clear autonomous session
   */
  const clearAutonomousSession = () => {
    autonomousSession.value = {
      sessionKey: null,
      companion: null,
      scenario: null,
      settings: null,
      history: [],
      sceneState: {
        lastImageAt: -3,
        currentLocation: '',
        recentEmotions: [],
        recentActions: [],
        lastOpeningPhrase: '',
      },
      backgroundImage: null,
    };
  };

  /**
   * Toggle autonomous mode on/off
   */
  const toggleAutonomousMode = (enabled) => {
    autonomousMode.value = enabled;

    if (enabled) {
      // Reset message counter when starting
      autonomousMessageCount.value = 0;

      // Start idle checking
      idleCheckInterval.value = setInterval(checkIdle, 5000);

      // Start autonomous message generation
      autonomousInterval.value = setInterval(generateAutonomousMessage, AUTONOMOUS_MESSAGE_INTERVAL.value);

      // Add event listeners
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('keydown', updateActivity);
      document.addEventListener('click', updateActivity);
      window.addEventListener('focus', updateActivity);

      console.log(`[SkillStore] Autonomous mode enabled (interval: ${AUTONOMOUS_MESSAGE_INTERVAL.value / 60000} min, max: ${MAX_AUTONOMOUS_MESSAGES.value} msgs)`);
    } else {
      // Clean up intervals
      if (idleCheckInterval.value) {
        clearInterval(idleCheckInterval.value);
        idleCheckInterval.value = null;
      }
      if (autonomousInterval.value) {
        clearInterval(autonomousInterval.value);
        autonomousInterval.value = null;
      }

      // Remove event listeners
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('keydown', updateActivity);
      document.removeEventListener('click', updateActivity);
      window.removeEventListener('focus', updateActivity);

      isIdle.value = false;
      console.log('[SkillStore] Autonomous mode disabled');
    }
  };

  /**
   * Fully stop autonomous mode and clear session
   */
  const stopAutonomousMode = () => {
    toggleAutonomousMode(false);
    clearAutonomousSession();
    missedMessages.value = 0;
  };

  /**
   * Clear missed messages counter
   */
  const clearMissedMessages = () => {
    missedMessages.value = 0;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // MOLTBOOK STATE ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Add activity to Moltbook activity log
   * @param {Object} activity - { action: string, title: string, postId?: string }
   */
  const addMoltbookActivity = (activity) => {
    const activityEntry = {
      ...activity,
      id: Date.now(),
      timestamp: Date.now(),
    };
    moltbookState.value.activityLog.push(activityEntry);

    // Keep last 50 activities
    if (moltbookState.value.activityLog.length > 50) {
      moltbookState.value.activityLog = moltbookState.value.activityLog.slice(-50);
    }

    console.log(`[SkillStore] Moltbook activity: ${activity.action} - ${activity.title}`);
  };

  /**
   * Update Moltbook last post time
   */
  const updateMoltbookPostTime = () => {
    moltbookState.value.lastPostTime = Date.now();
  };

  /**
   * Update Moltbook last engagement time
   */
  const updateMoltbookEngagementTime = () => {
    moltbookState.value.lastEngagementTime = Date.now();
  };

  /**
   * Add a post ID to the engaged posts list
   */
  const addEngagedPost = (postId) => {
    if (!moltbookState.value.engagedPosts.includes(postId)) {
      moltbookState.value.engagedPosts.push(postId);
      // Keep last 100 engaged posts
      if (moltbookState.value.engagedPosts.length > 100) {
        moltbookState.value.engagedPosts = moltbookState.value.engagedPosts.slice(-100);
      }
    }
  };

  /**
   * Check if we've already engaged with a post
   */
  const hasEngagedPost = (postId) => {
    return moltbookState.value.engagedPosts.includes(postId);
  };

  /**
   * Clear Moltbook state
   */
  const clearMoltbookState = () => {
    moltbookState.value = {
      lastPostTime: 0,
      lastEngagementTime: 0,
      activityLog: [],
      engagedPosts: [],
    };
  };

  /**
   * Request navigation to a specific skill (consumed by SmartAgent)
   */
  const requestSkillNavigation = (skillId) => {
    pendingSkillId.value = skillId;
  };

  /**
   * Clear pending skill navigation (called by SmartAgent after consuming)
   */
  const clearPendingSkillId = () => {
    pendingSkillId.value = null;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RETURN
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    // State
    isInitialized,
    isLoading,
    error,
    skills,
    runningSkill,
    runningStatus,
    runningProgress,
    executionHistory,
    selectedCategory,
    searchQuery,

    // Autonomous companion mode state
    autonomousMode,
    isIdle,
    missedMessages,
    autonomousSession,
    isGeneratingAutonomous,

    // Moltbook state
    moltbookState,

    // Getters
    categories,
    skillsByCategory,
    filteredSkills,
    getSkillsByCategory,
    getSkillById,
    getRequiredLevel,
    canRunSkill,
    accessibleSkills,
    skillsByLevel,

    // Actions
    initialize,
    executeSkill,
    registerSkill,
    publishSkill,
    setCategory,
    setSearchQuery,
    clearFilters,

    // Autonomous companion mode actions
    toggleAutonomousMode,
    startAutonomousSession,
    syncAutonomousHistory,
    getAutonomousSessionData,
    clearAutonomousSession,
    stopAutonomousMode,
    clearMissedMessages,
    updateActivity,
    autonomousMessageCount,
    autonomousConfig,
    IDLE_TIMEOUT,
    AUTONOMOUS_MESSAGE_INTERVAL,
    MAX_AUTONOMOUS_MESSAGES,

    // Moltbook actions
    addMoltbookActivity,
    updateMoltbookPostTime,
    updateMoltbookEngagementTime,
    addEngagedPost,
    hasEngagedPost,
    clearMoltbookState,

    // Navigation
    pendingSkillId,
    requestSkillNavigation,
    clearPendingSkillId,
  };
});

export default useSkillStore;
