/**
 * BonzAI Skill Store (Pinia)
 *
 * Manages skill loading, purchasing, and execution state.
 * Integrates with skill.service.js for core functionality.
 * Level-based access: skills require appropriate level based on models used.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { skillService } from '../services/skill.service.js';
import { levelService } from '../services/level.service.js';
import { SKILL_CATEGORIES, SKILL_CATEGORY_META } from '../skills/types.js';

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

  // Skills filtered by search query
  const filteredSkills = computed(() => {
    let result = skillsByCategory.value;

    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      result = result.filter(
        s =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          (s.tags && s.tags.some(t => t.toLowerCase().includes(query)))
      );
    }

    return result;
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
      // Load all skills (builtin + flagship)
      const { builtin, flagship } = await skillService.initializeSkills();
      skills.value = [...builtin, ...flagship];

      // Load user-created skills
      await loadUserSkills();

      // Load execution history
      await loadExecutionHistory();

      isInitialized.value = true;
      console.log(`[SkillStore] Initialized with ${skills.value.length} skills (${builtin.length} builtin, ${flagship.length} flagship)`);
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
        category: skillForm.category || 'utility',
        tags: [skillForm.category, 'user-created'],
        pricing: {
          purchasePrice: String(skillForm.price || 0.1),
          purchaseToken: 'ETH',
          runningFee: 99,
          runningFeeToken: 'BONZAI',
        },
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
  };
});

export default useSkillStore;
