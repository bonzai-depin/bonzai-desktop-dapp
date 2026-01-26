/**
 * BonzAI Skill Service
 *
 * Core service for loading, validating, and executing skills.
 * Supports both local built-in skills and on-chain registry skills.
 */

import {
  SKILL_SCHEMA_VERSION,
  validateSkillDefinition,
  createSkillDefinition,
} from '../skills/types.js';

import { flagshipSkills } from '../skills/flagship.js';

// Skill cache by ID
const skillCache = new Map();

// Registered skill loaders for different sources
const skillLoaders = new Map();

/**
 * Register a skill loader for a specific source type
 * @param {string} source - Source identifier (e.g., 'local', 'ipfs', 'onchain')
 * @param {Function} loader - Async function that loads skill definition
 */
export function registerSkillLoader(source, loader) {
  skillLoaders.set(source, loader);
}

/**
 * Load all built-in skills from the local skills directory
 * @returns {Promise<SkillDefinition[]>}
 */
export async function loadBuiltinSkills() {
  const skills = [];

  // Dynamically import all skill definitions from builtin directory
  // In production, these would be bundled; in dev, use dynamic imports
  try {
    const builtinModules = import.meta.glob('../skills/builtin/*.js', { eager: true });

    for (const [path, module] of Object.entries(builtinModules)) {
      const skill = module.default || module.skill;
      if (skill && skill.id) {
        const validation = validateSkillDefinition(skill);
        if (validation.valid) {
          skillCache.set(skill.id, skill);
          skills.push(skill);
          console.log(`[SkillService] Loaded builtin skill: ${skill.name} (${skill.id})`);
        } else {
          console.warn(`[SkillService] Invalid skill at ${path}:`, validation.errors);
        }
      }
    }
  } catch (e) {
    console.warn('[SkillService] No builtin skills found or error loading:', e.message);
  }

  return skills;
}

/**
 * Load flagship multi-modal skills
 * These are the premium consumer experience skills combining LLM, diffusion, and transformers
 * @returns {Promise<SkillDefinition[]>}
 */
export async function loadFlagshipSkills() {
  const skills = [];

  for (const skill of flagshipSkills) {
    if (skill && skill.id) {
      const validation = validateSkillDefinition(skill);
      if (validation.valid) {
        skillCache.set(skill.id, skill);
        skills.push(skill);
        console.log(`[SkillService] Loaded flagship skill: ${skill.name} (${skill.id})`);
      } else {
        console.warn(`[SkillService] Invalid flagship skill ${skill.id}:`, validation.errors);
      }
    }
  }

  console.log(`[SkillService] Loaded ${skills.length} flagship skills`);
  return skills;
}

/**
 * Initialize all skills (builtin + flagship)
 * Call this on app startup
 * @returns {Promise<{ builtin: SkillDefinition[], flagship: SkillDefinition[] }>}
 */
export async function initializeSkills() {
  console.log('[SkillService] Initializing skills...');

  const builtin = await loadBuiltinSkills();
  const flagship = await loadFlagshipSkills();

  console.log(`[SkillService] Initialization complete: ${builtin.length} builtin, ${flagship.length} flagship skills`);

  return { builtin, flagship };
}

/**
 * Load a skill from IPFS by hash
 * @param {string} ipfsHash - IPFS CID of the skill definition
 * @returns {Promise<SkillDefinition|null>}
 */
export async function loadSkillFromIPFS(ipfsHash) {
  const gateways = [
    `https://gateway.irys.xyz/${ipfsHash}`,
    `https://arweave.net/${ipfsHash}`,
    `https://ipfs.io/ipfs/${ipfsHash}`,
    `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
  ];

  for (const url of gateways) {
    try {
      const response = await fetch(url, { timeout: 10000 });
      if (!response.ok) continue;

      const skillDef = await response.json();
      const validation = validateSkillDefinition(skillDef);

      if (validation.valid) {
        skillCache.set(skillDef.id, skillDef);
        return skillDef;
      } else {
        console.warn(`[SkillService] Invalid skill from ${url}:`, validation.errors);
      }
    } catch (e) {
      console.warn(`[SkillService] Failed to fetch from ${url}:`, e.message);
    }
  }

  return null;
}

/**
 * Get a skill by ID (from cache or load if needed)
 * @param {string} skillId - Skill identifier
 * @returns {SkillDefinition|null}
 */
export function getSkill(skillId) {
  return skillCache.get(skillId) || null;
}

/**
 * Get all cached skills
 * @returns {SkillDefinition[]}
 */
export function getAllSkills() {
  return Array.from(skillCache.values());
}

/**
 * Get skills filtered by category
 * @param {string} category - Category to filter by
 * @returns {SkillDefinition[]}
 */
export function getSkillsByCategory(category) {
  return getAllSkills().filter(s => s.category === category);
}

/**
 * Search skills by name or description
 * @param {string} query - Search query
 * @returns {SkillDefinition[]}
 */
export function searchSkills(query) {
  const lower = query.toLowerCase();
  return getAllSkills().filter(
    s =>
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower) ||
      (s.tags && s.tags.some(t => t.toLowerCase().includes(lower)))
  );
}

/**
 * Build the system prompt for a skill
 * @param {SkillDefinition} skill - Skill definition
 * @param {Object} inputs - User-provided inputs
 * @returns {string}
 */
export function buildSkillSystemPrompt(skill, inputs = {}) {
  let systemPrompt = skill.prompt.system;

  // Replace input placeholders in system prompt
  for (const [key, value] of Object.entries(inputs)) {
    const placeholder = `{{${key}}}`;
    systemPrompt = systemPrompt.replace(new RegExp(placeholder, 'g'), String(value));
  }

  return systemPrompt;
}

/**
 * Build the task prompt for a skill
 * @param {SkillDefinition} skill - Skill definition
 * @param {Object} inputs - User-provided inputs
 * @returns {string}
 */
export function buildSkillTaskPrompt(skill, inputs = {}) {
  let taskPrompt = skill.prompt.task;

  // Replace input placeholders in task prompt
  for (const [key, value] of Object.entries(inputs)) {
    const placeholder = `{{${key}}}`;
    taskPrompt = taskPrompt.replace(new RegExp(placeholder, 'g'), String(value));
  }

  return taskPrompt;
}

/**
 * Validate user inputs against skill input schema
 * @param {SkillDefinition} skill - Skill definition
 * @param {Object} inputs - User-provided inputs
 * @returns {{ valid: boolean, errors: string[], normalizedInputs: Object }}
 */
export function validateSkillInputs(skill, inputs = {}) {
  const errors = [];
  const normalizedInputs = {};

  for (const [key, field] of Object.entries(skill.inputs)) {
    const value = inputs[key];

    // Use default if not provided
    if (value === undefined || value === null) {
      if (field.default !== undefined) {
        normalizedInputs[key] = field.default;
        continue;
      } else {
        errors.push(`Missing required input: ${key}`);
        continue;
      }
    }

    // Type validation
    switch (field.type) {
      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(`${key} must be a number`);
        } else {
          if (field.min !== undefined && num < field.min) {
            errors.push(`${key} must be at least ${field.min}`);
          }
          if (field.max !== undefined && num > field.max) {
            errors.push(`${key} must be at most ${field.max}`);
          }
          normalizedInputs[key] = num;
        }
        break;

      case 'string':
        normalizedInputs[key] = String(value);
        break;

      case 'select':
        if (field.options && !field.options.includes(value)) {
          errors.push(`${key} must be one of: ${field.options.join(', ')}`);
        } else {
          normalizedInputs[key] = value;
        }
        break;

      case 'boolean':
        normalizedInputs[key] = Boolean(value);
        break;

      default:
        normalizedInputs[key] = value;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedInputs,
  };
}

/**
 * Get tools for a skill in BonzAI app context
 * @param {SkillDefinition} skill - Skill definition
 * @returns {BonzaiTool[]}
 */
export function getSkillToolsForBonzai(skill) {
  return skill.tools?.bonzai || [];
}

/**
 * Get tools for a skill in MCP context
 * @param {SkillDefinition} skill - Skill definition
 * @returns {MCPTool[]}
 */
export function getSkillToolsForMCP(skill) {
  return skill.tools?.mcp || [];
}

/**
 * Execute a BonzAI tool via the electron proxy
 * @param {BonzaiTool} tool - Tool definition
 * @param {Object} args - Tool arguments
 * @returns {Promise<any>}
 */
export async function executeBonzaiTool(tool, args) {
  if (!window.electronAPI?.polymarketProxy && tool.proxy === 'polymarketProxy') {
    throw new Error('Polymarket proxy not available');
  }

  if (!window.electronAPI?.externalProxy && tool.proxy === 'externalProxy') {
    throw new Error('External proxy not available');
  }

  // Route to appropriate proxy
  switch (tool.proxy) {
    case 'polymarketProxy':
      return await window.electronAPI.polymarketProxy(tool.endpoint, args);

    case 'externalProxy':
      return await window.electronAPI.externalProxy(tool.endpoint, args);

    default:
      // Direct fetch for no-proxy tools
      const response = await fetch(tool.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      return await response.json();
  }
}

/**
 * Prepare a skill for execution with given inputs
 * Returns prompts and tools ready for AI inference
 * @param {string} skillId - Skill identifier
 * @param {Object} inputs - User-provided inputs
 * @returns {{ systemPrompt: string, taskPrompt: string, tools: BonzaiTool[], skill: SkillDefinition }|null}
 */
export function prepareSkillExecution(skillId, inputs = {}) {
  const skill = getSkill(skillId);
  if (!skill) {
    console.error(`[SkillService] Skill not found: ${skillId}`);
    return null;
  }

  const validation = validateSkillInputs(skill, inputs);
  if (!validation.valid) {
    console.error(`[SkillService] Invalid inputs for ${skillId}:`, validation.errors);
    return null;
  }

  return {
    skill,
    systemPrompt: buildSkillSystemPrompt(skill, validation.normalizedInputs),
    taskPrompt: buildSkillTaskPrompt(skill, validation.normalizedInputs),
    tools: getSkillToolsForBonzai(skill),
    inputs: validation.normalizedInputs,
  };
}

/**
 * Execute a skill with given inputs
 * Handles both prompt-based and embedded execution
 * @param {string} skillId - Skill identifier
 * @param {Object} inputs - User-provided inputs
 * @param {Object} context - Execution context (onProgress, etc.)
 * @returns {Promise<any>} - Skill execution result
 */
export async function executeSkill(skillId, inputs = {}, context = {}) {
  const skill = getSkill(skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${skillId}`);
  }

  // Validate inputs
  const validation = validateSkillInputs(skill, inputs);
  if (!validation.valid) {
    throw new Error(`Invalid inputs: ${validation.errors.join(', ')}`);
  }

  const normalizedInputs = validation.normalizedInputs;

  // Check if skill has an embedded execute function
  if (skill.execution?.execute && typeof skill.execution.execute === 'function') {
    console.log(`[SkillService] Executing embedded skill: ${skill.name}`);
    try {
      const result = await skill.execution.execute(normalizedInputs, context);
      return {
        success: true,
        skill: {
          id: skill.id,
          name: skill.name,
          category: skill.category,
        },
        inputs: normalizedInputs,
        result,
        executedAt: new Date().toISOString(),
      };
    } catch (e) {
      console.error(`[SkillService] Execution error for ${skill.name}:`, e);
      return {
        success: false,
        skill: {
          id: skill.id,
          name: skill.name,
          category: skill.category,
        },
        inputs: normalizedInputs,
        error: e.message,
        executedAt: new Date().toISOString(),
      };
    }
  }

  // For prompt-based skills, return prepared execution data
  const prepared = prepareSkillExecution(skillId, inputs);
  if (!prepared) {
    throw new Error(`Failed to prepare skill execution: ${skillId}`);
  }

  return {
    success: true,
    type: 'prompt-based',
    skill: {
      id: skill.id,
      name: skill.name,
      category: skill.category,
    },
    inputs: normalizedInputs,
    systemPrompt: prepared.systemPrompt,
    taskPrompt: prepared.taskPrompt,
    tools: prepared.tools,
    executedAt: new Date().toISOString(),
  };
}

/**
 * Get featured skills (flagship skills marked as featured)
 * @param {number} limit - Maximum number of skills to return
 * @returns {SkillDefinition[]}
 */
export function getFeaturedSkills(limit = 10) {
  const featured = flagshipSkills.filter(s => skillCache.has(s.id));
  return featured.slice(0, limit);
}

/**
 * Clear the skill cache
 */
export function clearSkillCache() {
  skillCache.clear();
}

/**
 * Register a skill manually (for testing or dynamic registration)
 * @param {SkillDefinition} skill - Skill definition
 * @returns {boolean} - Whether registration succeeded
 */
export function registerSkill(skill) {
  const validation = validateSkillDefinition(skill);
  if (!validation.valid) {
    console.error('[SkillService] Cannot register invalid skill:', validation.errors);
    return false;
  }

  skillCache.set(skill.id, skill);
  return true;
}

// Export service object
export const skillService = {
  // Loaders
  registerSkillLoader,
  loadBuiltinSkills,
  loadFlagshipSkills,
  loadSkillFromIPFS,
  initializeSkills,

  // Getters
  getSkill,
  getAllSkills,
  getSkillsByCategory,
  searchSkills,

  // Prompts
  buildSkillSystemPrompt,
  buildSkillTaskPrompt,

  // Validation
  validateSkillInputs,

  // Tools
  getSkillToolsForBonzai,
  getSkillToolsForMCP,
  executeBonzaiTool,

  // Execution
  prepareSkillExecution,
  executeSkill,

  // Discovery
  getFeaturedSkills,

  // Management
  clearSkillCache,
  registerSkill,
};

export default skillService;
