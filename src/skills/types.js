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
 * @typedef {Object} SkillPricing
 * @property {string} purchasePrice - Price in purchaseToken (e.g., "0.1")
 * @property {string} purchaseToken - Token symbol ("ETH" or "BONZAI")
 * @property {number} runningFee - Fee per execution in runningFeeToken
 * @property {string} runningFeeToken - Token for running fee ("BONZAI")
 * @property {string} [feeRecipient] - Override recipient address (defaults to author)
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
 * @property {string} purchasePrice - ETH price
 * @property {number} runningFee - BONZAI fee
 * @property {boolean} isVerified - Verification status
 * @property {number} totalPurchases - Total purchases
 * @property {number} totalExecutions - Total executions
 * @property {boolean} purchased - Whether current user purchased
 */

/**
 * @typedef {Object} SkillDefinition
 * @property {string} schema_version - Schema version (e.g., "1.0.0")
 * @property {string} id - Unique skill identifier
 * @property {string} name - Display name
 * @property {string} description - Skill description
 * @property {string} version - Skill version
 * @property {SkillAuthor} author - Author information
 * @property {string} category - Category: "analysis", "trading", "training", etc.
 * @property {string[]} [tags] - Searchable tags
 * @property {SkillPricing} pricing - Pricing configuration
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
export const DEFAULT_PRICING = {
  purchasePrice: '0.1',
  purchaseToken: 'ETH',
  runningFee: 99,
  runningFeeToken: 'BONZAI',
};

export const DEFAULT_REQUIREMENTS = {
  minLevel: 1,
  requiredApis: [],
  requiredPermissions: ['network:read'],
};

// Categories
export const SKILL_CATEGORIES = [
  // Core/Platform categories
  'prediction-market',  // Polymarket, TCG, DSLA prediction markets
  'analysis',           // Data analysis and insights
  'trading',            // Trading strategies and copy-trading
  'training',           // Model training and fine-tuning
  'automation',         // Automated workflows
  // Consumer lifestyle categories
  'housing',            // Real estate, interior design, renovation
  'transportation',     // Vehicles, travel, commute
  'food',               // Recipes, meal planning, restaurant
  'insurance',          // Policy analysis, claims, coverage
  'healthcare',         // Wellness, fitness, mental health
  'entertainment',      // Stories, music, games, media
  'education',          // Learning, tutoring, courses
  'fashion',            // Style, wardrobe, accessories
  'personal-care',      // Skincare, grooming, self-care
  'reading',            // Books, articles, audiobooks
  // General
  'utility',            // General utilities
];

// Category metadata for UI
export const SKILL_CATEGORY_META = {
  // Core/Platform
  'prediction-market': {
    label: 'Prediction Markets',
    icon: 'finance_mode',
    description: 'Issue and trade on prediction market outcomes',
  },
  'analysis': {
    label: 'Analysis',
    icon: 'analytics',
    description: 'Data analysis and market insights',
  },
  'trading': {
    label: 'Trading',
    icon: 'candlestick_chart',
    description: 'Copy-trading and trading strategies',
  },
  'training': {
    label: 'Training',
    icon: 'model_training',
    description: 'AI model training and fine-tuning',
  },
  'automation': {
    label: 'Automation',
    icon: 'auto_mode',
    description: 'Automated workflows and pipelines',
  },
  // Consumer lifestyle
  'housing': {
    label: 'Housing',
    icon: 'home',
    description: 'Interior design, staging, renovation visualization',
  },
  'transportation': {
    label: 'Transportation',
    icon: 'directions_car',
    description: 'Vehicle customization, travel planning',
  },
  'food': {
    label: 'Food',
    icon: 'restaurant',
    description: 'Recipes, meal planning, culinary content',
  },
  'insurance': {
    label: 'Insurance',
    icon: 'shield',
    description: 'Policy analysis, claims, coverage optimization',
  },
  'healthcare': {
    label: 'Healthcare',
    icon: 'health_and_safety',
    description: 'Wellness, fitness, meditation, mental health',
  },
  'entertainment': {
    label: 'Entertainment',
    icon: 'movie',
    description: 'Stories, music, games, creative content',
  },
  'education': {
    label: 'Education',
    icon: 'school',
    description: 'Learning, tutoring, animated lessons',
  },
  'fashion': {
    label: 'Fashion',
    icon: 'checkroom',
    description: 'Style, lookbooks, wardrobe planning',
  },
  'personal-care': {
    label: 'Personal Care',
    icon: 'spa',
    description: 'Skincare, grooming, self-care routines',
  },
  'reading': {
    label: 'Reading',
    icon: 'menu_book',
    description: 'Books, audiobooks, literary content',
  },
  // General
  'utility': {
    label: 'Utility',
    icon: 'handyman',
    description: 'General purpose tools',
  },
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
  if (!skill.pricing) {
    errors.push('Missing pricing');
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

  return {
    schema_version: SKILL_SCHEMA_VERSION,
    id: partial.id || generateSkillId(partial.name || 'unnamed', partial.version || '1.0.0'),
    name: partial.name || 'Unnamed Skill',
    description: partial.description || '',
    version: partial.version || '1.0.0',
    author: {
      address: '0x0000000000000000000000000000000000000000',
      name: 'Unknown',
      verified: false,
      ...partial.author,
    },
    category: partial.category || 'utility',
    tags: partial.tags || [],
    pricing: {
      ...DEFAULT_PRICING,
      ...partial.pricing,
    },
    requirements: {
      ...DEFAULT_REQUIREMENTS,
      ...partial.requirements,
    },
    inputs: partial.inputs || {},
    prompt: {
      system: '',
      task: '',
      ...partial.prompt,
    },
    tools: {
      bonzai: [],
      mcp: [],
      ...partial.tools,
    },
    execution: {
      type: 'javascript',
      ...partial.execution,
    },
    metadata: {
      createdAt: now,
      updatedAt: now,
      ...partial.metadata,
    },
  };
}

export default {
  SKILL_SCHEMA_VERSION,
  DEFAULT_PRICING,
  DEFAULT_REQUIREMENTS,
  SKILL_CATEGORIES,
  SKILL_CATEGORY_META,
  generateSkillId,
  validateSkillDefinition,
  createSkillDefinition,
};
