/**
 * Agent to Skill Adapter
 *
 * Converts existing BonzAI agents to the unified Skill format.
 * This enables backward compatibility while migrating to the skill system.
 */

import {
  SKILL_SCHEMA_VERSION,
  createSkillDefinition,
  generateSkillId,
} from '../types.js';

/**
 * Convert an existing agent definition to a skill definition
 * @param {Object} agent - Legacy agent definition
 * @param {Object} options - Conversion options
 * @returns {SkillDefinition}
 */
export function agentToSkill(agent, options = {}) {
  const {
    authorAddress = '0x0000000000000000000000000000000000000000',
    verified = false,
  } = options;

  // Extract pricing from legacy requirements
  const pricing = extractPricing(agent);

  // Extract inputs with proper schema
  const inputs = extractInputs(agent);

  // Build prompt from agent metadata
  const prompt = buildPromptFromAgent(agent);

  // Build tools based on agent's data sources
  const tools = extractTools(agent);

  // Create the skill definition
  return createSkillDefinition({
    id: agent.id || generateSkillId(agent.name, agent.version || '1.0.0'),
    name: agent.name,
    description: agent.description,
    version: agent.version || '1.0.0',
    author: {
      address: authorAddress,
      name: agent.author?.name || 'BonzAI',
      verified,
    },
    category: agent.category || 'utility',
    tags: agent.tags || extractTagsFromDescription(agent.description),
    pricing,
    requirements: {
      minLevel: agent.requirements?.minLevel || 1,
      requiredApis: extractRequiredApis(agent),
      requiredPermissions: ['network:read'],
    },
    inputs,
    prompt,
    tools,
    execution: {
      type: 'embedded',
      execute: agent.execute,
      entrypoint: 'execute',
    },
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      thumbnail: agent.thumbnail,
      originalFormat: 'agent',
    },
  });
}

/**
 * Extract pricing from legacy agent requirements
 * @param {Object} agent - Legacy agent
 * @returns {SkillPricing}
 */
function extractPricing(agent) {
  const req = agent.requirements || {};

  return {
    purchasePrice: req.purchasePrice?.amount || '0.1',
    purchaseToken: req.purchasePrice?.token || 'ETH',
    runningFee: req.runningFee?.amount || 99,
    runningFeeToken: req.runningFee?.token || 'BONZAI',
  };
}

/**
 * Extract and normalize input definitions
 * @param {Object} agent - Legacy agent
 * @returns {Object.<string, SkillInputField>}
 */
function extractInputs(agent) {
  const inputs = {};

  for (const [key, field] of Object.entries(agent.inputs || {})) {
    inputs[key] = {
      type: normalizeInputType(field.type),
      default: field.default,
      label: field.label || key,
      description: field.description,
    };

    // Add constraints
    if (field.min !== undefined) inputs[key].min = field.min;
    if (field.max !== undefined) inputs[key].max = field.max;
    if (field.options) inputs[key].options = field.options;
  }

  return inputs;
}

/**
 * Normalize input type to skill schema types
 * @param {string} type - Legacy type
 * @returns {string}
 */
function normalizeInputType(type) {
  const typeMap = {
    number: 'number',
    string: 'string',
    text: 'string',
    boolean: 'boolean',
    bool: 'boolean',
    select: 'select',
    dropdown: 'select',
    enum: 'select',
  };

  return typeMap[type?.toLowerCase()] || 'string';
}

/**
 * Build AI prompt from agent metadata
 * @param {Object} agent - Legacy agent
 * @returns {SkillPrompt}
 */
function buildPromptFromAgent(agent) {
  // Default system prompt based on agent type
  const systemPromptTemplates = {
    analysis: `You are a skilled market analyst specializing in prediction markets and trading data.
Your role is to analyze data from ${agent.name} and provide actionable insights.
Be concise, data-driven, and highlight key patterns and recommendations.`,

    trading: `You are an expert trading advisor for prediction markets.
Your role is to analyze positions and suggest optimal trading strategies.
Consider risk management, position sizing, and market conditions.`,

    prediction: `You are a prediction market specialist with deep expertise in probability assessment.
Your role is to evaluate market conditions and provide probability-weighted recommendations.`,

    default: `You are a helpful AI assistant specialized in ${agent.name}.
${agent.description}
Provide clear, actionable insights based on the data provided.`,
  };

  const systemPrompt =
    agent.prompt?.system ||
    systemPromptTemplates[agent.category] ||
    systemPromptTemplates.default;

  // Build task prompt with input placeholders
  const inputPlaceholders = Object.entries(agent.inputs || {})
    .map(([key, field]) => `- ${field.label || key}: {{${key}}}`)
    .join('\n');

  const taskPrompt =
    agent.prompt?.task ||
    `Execute the ${agent.name} analysis with the following parameters:

${inputPlaceholders}

Analyze the results and provide:
1. Key findings and patterns
2. Actionable recommendations
3. Risk considerations
4. Suggested next steps`;

  return {
    system: systemPrompt,
    task: taskPrompt,
    outputFormat: agent.prompt?.outputFormat || {
      type: 'structured',
      fields: ['summary', 'recommendations', 'risks'],
    },
  };
}

/**
 * Extract tools from agent's API usage patterns
 * @param {Object} agent - Legacy agent
 * @returns {SkillTools}
 */
function extractTools(agent) {
  const bonzaiTools = [];
  const mcpTools = [];

  // Detect Polymarket usage
  if (
    agent.id?.includes('polymarket') ||
    agent.name?.toLowerCase().includes('polymarket') ||
    agent.description?.toLowerCase().includes('polymarket')
  ) {
    // BonzAI app tools (via Electron proxy)
    bonzaiTools.push(
      {
        name: 'polymarket_leaderboard',
        endpoint: 'leaderboard',
        proxy: 'polymarketProxy',
        description: 'Fetch top performing traders from Polymarket leaderboard',
      },
      {
        name: 'polymarket_positions',
        endpoint: 'positions',
        proxy: 'polymarketProxy',
        description: 'Get positions for a specific trader wallet',
      },
      {
        name: 'polymarket_markets',
        endpoint: 'markets',
        proxy: 'polymarketProxy',
        description: 'Get market data from Polymarket',
      },
      {
        name: 'polymarket_holders',
        endpoint: 'holders',
        proxy: 'polymarketProxy',
        description: 'Get top holders for a specific market',
      }
    );

    // MCP tools for Claude Code
    mcpTools.push(
      {
        name: 'fetch_leaderboard',
        description: 'Fetch top performing traders from Polymarket leaderboard',
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['OVERALL', 'POLITICS', 'SPORTS', 'CRYPTO'],
              default: 'OVERALL',
            },
            timePeriod: {
              type: 'string',
              enum: ['DAY', 'WEEK', 'MONTH', 'ALL'],
              default: 'WEEK',
            },
            limit: {
              type: 'number',
              default: 10,
              minimum: 1,
              maximum: 100,
            },
          },
          required: [],
        },
      },
      {
        name: 'fetch_trader_positions',
        description: 'Get all active positions for a specific trader wallet',
        inputSchema: {
          type: 'object',
          properties: {
            wallet: {
              type: 'string',
              description: 'Trader proxy wallet address',
            },
            sizeThreshold: {
              type: 'number',
              default: 100,
              description: 'Minimum position size to include',
            },
          },
          required: ['wallet'],
        },
      },
      {
        name: 'fetch_markets',
        description: 'Get active prediction markets from Polymarket',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              default: 10,
              minimum: 1,
              maximum: 50,
            },
            active: {
              type: 'boolean',
              default: true,
            },
          },
          required: [],
        },
      }
    );
  }

  return { bonzai: bonzaiTools, mcp: mcpTools };
}

/**
 * Extract required APIs based on agent functionality
 * @param {Object} agent - Legacy agent
 * @returns {string[]}
 */
function extractRequiredApis(agent) {
  const apis = [];

  if (
    agent.id?.includes('polymarket') ||
    agent.name?.toLowerCase().includes('polymarket')
  ) {
    apis.push('polymarket');
  }

  return apis;
}

/**
 * Extract tags from description
 * @param {string} description - Agent description
 * @returns {string[]}
 */
function extractTagsFromDescription(description) {
  if (!description) return [];

  const keywords = [
    'trading',
    'prediction',
    'market',
    'analysis',
    'copy',
    'whale',
    'pnl',
    'position',
    'polymarket',
  ];

  const lower = description.toLowerCase();
  return keywords.filter((k) => lower.includes(k));
}

/**
 * Batch convert multiple agents to skills
 * @param {Object[]} agents - Array of legacy agents
 * @param {Object} options - Conversion options
 * @returns {SkillDefinition[]}
 */
export function batchAgentToSkill(agents, options = {}) {
  return agents.map((agent) => agentToSkill(agent, options));
}

/**
 * Create a skill wrapper that can execute legacy agent code
 * @param {Object} agent - Legacy agent
 * @returns {Function}
 */
export function createSkillExecutor(agent) {
  return async (inputs, context) => {
    // Merge defaults with provided inputs
    const mergedInputs = {};
    for (const [key, field] of Object.entries(agent.inputs || {})) {
      mergedInputs[key] = inputs[key] ?? field.default;
    }

    // Execute the legacy agent
    const result = await agent.execute(mergedInputs, context);

    // Wrap result in skill output format
    return {
      success: !result.errors?.length,
      data: result,
      executedAt: new Date().toISOString(),
      skillId: agent.id,
    };
  };
}

export default {
  agentToSkill,
  batchAgentToSkill,
  createSkillExecutor,
};
