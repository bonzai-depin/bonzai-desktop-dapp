/**
 * BonzAI Skill Types & Schema
 *
 * Skills are packaged prompts with pre-configured tools that work in both
 * BonzAI app and Claude Code CLI via MCP (Model Context Protocol).
 */

/**
 * @typedef {Object} SkillAuthor
 * @property {string} address - Ethereum wallet address
 * @property {string} name - Display name
 * @property {boolean} verified - Whether verified by BonzAI team
 */

/**
 * @typedef {Object} SkillInputField
 * @property {string} type - Input type: "number", "string", "select", "boolean"
 * @property {*} default - Default value
 * @property {string} label - Display label
 * @property {string} [description] - Help text
 * @property {number} [min] - Minimum value (for numbers)
 * @property {number} [max] - Maximum value (for numbers)
 * @property {string[]} [options] - Options (for select type)
 */

/**
 * @typedef {Object} SkillPrompt
 * @property {string} system - System prompt for the AI
 * @property {string} task - Task description / user prompt template
 * @property {Object} [outputFormat] - Expected output structure
 */

/**
 * @typedef {Object} BonzaiTool
 * @property {string} name - Tool name
 * @property {string} endpoint - API endpoint or function name
 * @property {string} proxy - Proxy to use ("polymarketProxy", "externalProxy")
 * @property {string} description - Tool description
 */

/**
 * @typedef {Object} MCPTool
 * @property {string} name - Tool name for MCP
 * @property {string} description - Tool description
 * @property {Object} inputSchema - JSON Schema for input validation
 */

/**
 * @typedef {Object} SkillTools
 * @property {BonzaiTool[]} bonzai - Tools for BonzAI app context
 * @property {MCPTool[]} mcp - Tools for MCP/Claude Code context
 */

/**
 * @typedef {Object} SkillExecution
 * @property {string} type - Execution type: "javascript", "embedded", "external"
 * @property {string} [entrypoint] - Function name to call
 * @property {string} [codeHash] - IPFS hash of execution code
 * @property {Function} [execute] - Embedded execute function (for local skills)
 */

/**
 * @typedef {Object} SkillRequirements
 * @property {number} minLevel - Minimum BonzAI level required
 * @property {string[]} requiredApis - Required API access
 * @property {string[]} requiredPermissions - Required permissions
 */

/**
 * @typedef {Object} SkillMetadata
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 * @property {string} [license] - License type
 * @property {string} [repository] - Source repository URL
 */

/**
 * @typedef {Object} OnChainData
 * @property {string} id - Skill ID (bytes32)
 * @property {string} author - Author address
 * @property {boolean} isVerified - Verification status
 * @property {number} totalExecutions - Total executions
 */

/**
 * @typedef {Object} SkillDefinition
 * @property {string} schema_version - Schema version (e.g., "1.0.0")
 * @property {string} id - Unique skill identifier
 * @property {string} name - Display name
 * @property {string} description - Skill description
 * @property {string} version - Skill version
 * @property {SkillAuthor} author - Author information
 * @property {string} category - Category: "finance", "entertainment", etc.
 * @property {SkillRequirements} [requirements] - Access requirements
 * @property {Object.<string, SkillInputField>} inputs - Input field definitions
 * @property {SkillPrompt} prompt - Prompt configuration
 * @property {SkillTools} tools - Tool definitions
 * @property {SkillExecution} execution - Execution configuration
 * @property {SkillMetadata} [metadata] - Additional metadata
 * @property {OnChainData} [onChain] - On-chain data (populated at runtime)
 */

// Schema version
export const SKILL_SCHEMA_VERSION = '1.0.0';

// Default values
export const DEFAULT_REQUIREMENTS = {
  minLevel: 1,
  requiredApis: [],
  requiredPermissions: ['network:read'],
};

// Categories (alphabetically sorted for UI display).
// NOTE: This is UI display order. For on-chain packing order, use
// SPENDING_CATEGORIES_ORDER from src/constants/index.js.
export const SKILL_CATEGORIES = [
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
];

// Category metadata for UI (alphabetically sorted)
export const SKILL_CATEGORY_META = {
  'beauty': { label: 'Beauty', icon: 'spa' },
  'education': { label: 'Education', icon: 'school' },
  'entertainment': { label: 'Entertainment', icon: 'chair' },
  'fashion': { label: 'Fashion', icon: 'checkroom' },
  'finance': { label: 'Finance', icon: 'finance_mode' },
  'food': { label: 'Food', icon: 'restaurant' },
  'healthcare': { label: 'Healthcare', icon: 'health_and_safety' },
  'housing': { label: 'Housing', icon: 'home' },
  'reading': { label: 'Reading', icon: 'menu_book' },
  'social': { label: 'Social', icon: 'groups' },
  'sports': { label: 'Sports', icon: 'sports' },
  'travel': { label: 'Travel', icon: 'flight' },
};

/**
 * Generate a skill ID from name and version
 * @param {string} name - Skill name
 * @param {string} version - Skill version
 * @returns {string} - Skill ID
 */
export function generateSkillId(name, version) {
  const normalized = `${name.toLowerCase().replace(/\s+/g, '-')}-v${version}`;
  return normalized;
}

/**
 * Validate a skill definition
 * @param {SkillDefinition} skill - Skill to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSkillDefinition(skill) {
  const errors = [];

  if (!skill.schema_version) {
    errors.push('Missing schema_version');
  }
  if (!skill.id) {
    errors.push('Missing id');
  }
  if (!skill.name || skill.name.length < 3) {
    errors.push('Name must be at least 3 characters');
  }
  if (!skill.description) {
    errors.push('Missing description');
  }
  if (!skill.version) {
    errors.push('Missing version');
  }
  if (!skill.author?.address) {
    errors.push('Missing author address');
  }
  if (!skill.inputs || Object.keys(skill.inputs).length === 0) {
    errors.push('At least one input is required');
  }
  if (!skill.prompt?.system || !skill.prompt?.task) {
    errors.push('Missing prompt.system or prompt.task');
  }
  if (!skill.execution) {
    errors.push('Missing execution configuration');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a minimal skill definition with defaults
 * @param {Partial<SkillDefinition>} partial - Partial skill definition
 * @returns {SkillDefinition}
 */
export function createSkillDefinition(partial) {
  const now = new Date().toISOString();

  // Extract known nested objects to merge properly
  const { author, requirements, prompt, tools, execution, metadata, ...rest } = partial;

  return {
    // Spread any additional custom properties first (like featured, tags, chatBased, etc.)
    ...rest,
    // Then set the standard properties with defaults
    schema_version: SKILL_SCHEMA_VERSION,
    id: partial.id || generateSkillId(partial.name || 'unnamed', partial.version || '1.0.0'),
    name: partial.name || 'Unnamed Skill',
    description: partial.description || '',
    version: partial.version || '1.0.0',
    author: {
      address: '0x0000000000000000000000000000000000000000',
      name: 'Unknown',
      verified: false,
      ...author,
    },
    category: partial.category || 'finance',
    requirements: {
      ...DEFAULT_REQUIREMENTS,
      ...requirements,
    },
    inputs: partial.inputs || {},
    prompt: {
      system: '',
      task: '',
      ...prompt,
    },
    tools: {
      bonzai: [],
      mcp: [],
      ...tools,
    },
    execution: {
      type: 'javascript',
      ...execution,
    },
    metadata: {
      createdAt: now,
      updatedAt: now,
      ...metadata,
    },
  };
}

export default {
  SKILL_SCHEMA_VERSION,
  DEFAULT_REQUIREMENTS,
  SKILL_CATEGORIES,
  SKILL_CATEGORY_META,
  generateSkillId,
  validateSkillDefinition,
  createSkillDefinition,
};
