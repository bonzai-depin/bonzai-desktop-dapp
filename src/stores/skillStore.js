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
import { ref, computed, toRaw } from 'vue';
import { skillService } from '../services/skill.service.js';
import { levelService } from '../services/level.service.js';
import { SKILL_CATEGORIES, SKILL_CATEGORY_META } from '../skills/types.js';
import { roleplayCompanion } from '../skills/flagship.js';

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

  // Search query
  const searchQuery = ref('');

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
  const IDLE_TIMEOUT = 300000; // 5 minutes of inactivity to consider idle
  const AUTONOMOUS_MESSAGE_INTERVAL = 60000; // 1 minute between autonomous messages
  const STORAGE_KEY = 'roleplaySessions';

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

  // Skills filtered by search query, with featured skills first
  const filteredSkills = computed(() => {
    let result = skillsByCategory.value;

    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      result = result.filter(
        s =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query)
      );
    }

    // Sort featured skills to the top
    return [...result].sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return 0;
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
    const apis = skill.requirements?.requiredApis || [];

    // Check from highest to lowest
    if (apis.includes('training') || apis.includes('robot')) return 'LVL6';
    if (apis.includes('3d') || apis.includes('game')) return 'LVL5';
    if (apis.includes('video')) return 'LVL4';
    if (apis.includes('image')) return 'LVL3';
    if (apis.includes('audio') || apis.includes('tts')) return 'LVL2';
    if (apis.includes('llm') || apis.includes('text')) return 'LVL1';

    // Default to highest required API from skill definition
    return `LVL${skill.requirements?.minLevel || 1}`;
  };

  /**
   * Check if user can run a skill based on their level
   */
  const canRunSkill = (skillId) => {
    const skill = getSkillById(skillId);
    if (!skill) return { canRun: false, reason: 'Skill not found' };

    const requiredLevel = getRequiredLevel(skill);
    const hasAccess = levelService.isLevelActive(requiredLevel);

    if (!hasAccess) {
      const blockReason = levelService.getLevelBlockReason(requiredLevel);
      return {
        canRun: false,
        reason: blockReason,
        requiredLevel,
      };
    }

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
    isIdle.value = !hasFocus || timeSinceActive > IDLE_TIMEOUT;

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

    // Check if user came back
    if (document.hasFocus() && Date.now() - lastActiveTime.value < IDLE_TIMEOUT) {
      console.log('[SkillStore] Skipping autonomous generation - user came back');
      return;
    }

    const session = autonomousSession.value;
    if (!session.companion || !session.scenario) {
      console.log('[SkillStore] No active autonomous session - companion:', !!session.companion, 'scenario:', !!session.scenario);
      return;
    }

    isGeneratingAutonomous.value = true;
    console.log(`[SkillStore] Generating autonomous message for ${session.companion.name}...`);

    try {
      // Create autonomous prompt
      const autonomousPrompt = `*${session.companion.name} notices you haven't responded in a while. They continue with their day, doing something within the scenario context, and update you about what they're doing.*`;

      // Add user message to history
      const userMsg = {
        role: 'user',
        content: autonomousPrompt,
        timestamp: Date.now(),
        isAutonomous: true,
      };
      session.history.push(userMsg);

      // Build responseMode from settings
      const responseMode = ['text'];
      if (session.settings.enableImage) responseMode.push('image');
      if (session.settings.enableAudio) responseMode.push('audio');
      if (session.settings.enableVideo) responseMode.push('video');

      // Create execution context
      const context = {
        updateStatus: (status) => {
          runningStatus.value = status;
        },
        onProgress: null, // No streaming when running autonomously
      };

      // Call roleplayCompanion.execution.executeMessage
      const result = await roleplayCompanion.execution.executeMessage(
        {
          userMessage: autonomousPrompt,
          session: {
            companion: session.companion,
            scenario: session.scenario,
            history: session.history.slice(0, -1), // Exclude the message we just added
          },
          settings: {
            contentLevel: session.settings.contentLevel,
            responseMode: responseMode.join('+'),
          },
          sceneState: session.sceneState,
        },
        context
      );

      console.log('[SkillStore] Autonomous generation result:', result);

      // The result structure is: { success, character, response: {...}, sceneState, meta }
      // The actual response data is in result.response
      const responseData = result.response || {};

      // Extract response text - it's in result.response.response
      const responseText = typeof responseData.response === 'string'
        ? responseData.response
        : (responseData.text || responseData.content || result.text || '');

      if (!responseText) {
        console.warn('[SkillStore] No response text in result. responseData:', responseData);
        throw new Error('No response text generated');
      }

      // Update scene state from result.sceneState or responseData
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
          ...session.sceneState.recentActions.slice(-1),
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

      // Create assistant message
      const assistantMsg = {
        role: 'assistant',
        content: responseText,
        emotion: responseData.emotion,
        action: responseData.action,
        image: responseData.image || null,
        audio: responseData.audio || null,
        video: responseData.video || null,
        timestamp: Date.now(),
        isAutonomous: true,
      };

      session.history.push(assistantMsg);
      missedMessages.value++;

      // Save session to storage
      await saveAutonomousSession();

      console.log(`[SkillStore] Autonomous message generated: "${responseText?.substring(0, 50)}..."`);
    } catch (e) {
      console.error('[SkillStore] Autonomous message generation failed:', e);
      // Remove the user message we added
      session.history.pop();
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
    };
    console.log(`[SkillStore] Autonomous session started: ${sessionData.companion?.name} in ${sessionData.scenario?.name}`);
  };

  /**
   * Sync history from RoleplayChat (when user sends a message while on the view)
   */
  const syncAutonomousHistory = (history, sceneState) => {
    if (autonomousSession.value.sessionKey) {
      autonomousSession.value.history = [...history];
      if (sceneState) {
        autonomousSession.value.sceneState = { ...sceneState };
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
      // Start idle checking
      idleCheckInterval.value = setInterval(checkIdle, 5000);

      // Start autonomous message generation
      autonomousInterval.value = setInterval(generateAutonomousMessage, AUTONOMOUS_MESSAGE_INTERVAL);

      // Add event listeners
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('keydown', updateActivity);
      document.addEventListener('click', updateActivity);
      window.addEventListener('focus', updateActivity);

      console.log('[SkillStore] Autonomous mode enabled');
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
  };
});

export default useSkillStore;
