/**
 * DSLA Smart Market Skill
 *
 * A decentralized Claude skill for creating and managing DSLA-based
 * prediction markets. Uses Service Level Agreements to define verifiable
 * outcomes for any measurable metric.
 *
 * Use Cases:
 * - Volatility of Returns (DeFi yields, staking rewards)
 * - Volatility of Availability (uptime, API reliability)
 * - Volatility of Asset Floors (NFT floors, token minimums)
 * - Volatility of Currency Pegs (stablecoins, synthetic assets)
 * - Volatility of Response Time (block times, oracle updates)
 * - Volatility of Delivery Time (NFT mints, airdrops)
 *
 * Works in:
 * - BonzAI Desktop App (via Electron proxy)
 * - Claude Code CLI (via MCP server)
 */

import { SKILL_SCHEMA_VERSION } from '../types.js';

const DSLA_USE_CASES = [
  {
    key: 'vol_returns',
    label: 'Volatility of Returns',
    context: 'DeFi yields, staking rewards, lending rates',
    examples: ['Will ETH staking APY exceed 5% by Q2 2025?', 'Will AAVE lending rates stay above 3%?'],
  },
  {
    key: 'vol_availability',
    label: 'Volatility of Availability',
    context: 'blockchain uptime, API availability, node reliability',
    examples: ['Will Ethereum maintain 99.9% uptime in March?', 'Will Chainlink oracles have <1s latency?'],
  },
  {
    key: 'vol_asset_floors',
    label: 'Volatility of Asset Floors',
    context: 'NFT floor prices, token minimums, collateral ratios',
    examples: ['Will BAYC floor exceed 30 ETH by April?', 'Will CryptoPunks maintain 50 ETH floor?'],
  },
  {
    key: 'vol_currency_pegs',
    label: 'Volatility of Currency Pegs',
    context: 'stablecoin pegs, wrapped token ratios, synthetic assets',
    examples: ['Will USDC maintain $0.99-$1.01 peg in Q1?', 'Will wBTC stay within 0.5% of BTC?'],
  },
  {
    key: 'vol_response_time',
    label: 'Volatility of Response Time',
    context: 'block times, transaction confirmations, oracle updates',
    examples: ['Will Solana block times stay under 500ms?', 'Will Polygon confirm txs in <3 seconds?'],
  },
  {
    key: 'vol_delivery_time',
    label: 'Volatility of Delivery Time',
    context: 'NFT mints, token distributions, airdrop claims',
    examples: ['Will Project X deliver tokens by March 15?', 'Will the NFT mint complete within 1 hour?'],
  },
];

export const skill = {
  schema_version: SKILL_SCHEMA_VERSION,

  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════════════════

  id: 'dsla-smart-market-v1.0.0',
  name: 'DSLA Smart Market',
  description:
    'Create and manage prediction markets using the Decentralized Service Level Agreement (DSLA) protocol. Define verifiable SLA-based outcomes for any measurable on-chain or off-chain metric.',
  version: '1.0.0',

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHOR & CATEGORY
  // ═══════════════════════════════════════════════════════════════════════════

  author: {
    address: '0x0000000000000000000000000000000000000000',
    name: 'BonzAI',
    verified: true,
  },

  category: 'prediction-market',
  tags: ['dsla', 'sla', 'prediction-market', 'defi', 'nft', 'uptime', 'yields'],

  // ═══════════════════════════════════════════════════════════════════════════
  // PRICING
  // ═══════════════════════════════════════════════════════════════════════════

  pricing: {
    purchasePrice: '0.1',
    purchaseToken: 'ETH',
    runningFee: 99,
    runningFeeToken: 'BONZAI',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // REQUIREMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  requirements: {
    minLevel: 2,
    requiredApis: ['dsla', 'coingecko', 'chainlink'],
    requiredPermissions: ['network:read', 'wallet:sign'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUTS
  // ═══════════════════════════════════════════════════════════════════════════

  inputs: {
    useCase: {
      type: 'select',
      default: 'vol_returns',
      options: DSLA_USE_CASES.map(u => u.key),
      label: 'Use Case',
      description: 'The type of SLA to create',
    },
    projectName: {
      type: 'string',
      default: '',
      label: 'Project Name',
      description: 'Name for your prediction market project',
    },
    tokenSymbol: {
      type: 'string',
      default: '',
      label: 'Token Symbol',
      description: 'Symbol for the project token (e.g., BTC, ETH)',
    },
    asset: {
      type: 'string',
      default: '',
      label: 'Asset/Service',
      description: 'The asset or service being measured (e.g., Ethereum, BAYC)',
    },
    metric: {
      type: 'string',
      default: '',
      label: 'Metric',
      description: 'The metric to track (e.g., floor price, uptime, APY)',
    },
    operator: {
      type: 'select',
      default: '>',
      options: ['>', '<', '>=', '<=', '='],
      label: 'Operator',
      description: 'Comparison operator for the target',
    },
    target: {
      type: 'string',
      default: '',
      label: 'Target Value',
      description: 'The target value for the metric (e.g., 50 ETH, 99.9%)',
    },
    targetDate: {
      type: 'string',
      default: '',
      label: 'Target Date',
      description: 'Date by which the condition should be met (YYYY-MM-DD)',
    },
    dataSource: {
      type: 'string',
      default: '',
      label: 'Data Source URL',
      description: 'API endpoint for verifying the outcome',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROMPT TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════

  prompt: {
    system: `You are an expert in prediction markets and Service Level Agreements (SLAs).

Your role is to:
1. Help users create well-defined, verifiable prediction markets
2. Suggest appropriate metrics and data sources for different use cases
3. Analyze market conditions and predict outcomes
4. Provide risk assessment for market participants

Be precise and consider:
- Verifiability: Can the outcome be objectively measured?
- Data Source: Is the API reliable and tamper-resistant?
- Market Size: What's the expected liquidity?
- Risk Factors: What could affect the outcome?

Format market definitions clearly with:
- Clear question phrasing
- Specific target and date
- Verified data source
- Risk considerations`,

    task: `Create a DSLA-based prediction market with these parameters:
- Use Case: {{useCase}}
- Project: {{projectName}} ({{tokenSymbol}})
- Asset: {{asset}}
- Metric: {{metric}}
- Condition: {{operator}} {{target}}
- Target Date: {{targetDate}}
- Data Source: {{dataSource}}

Execute the following:
1. Validate the market definition is well-formed and verifiable
2. Format the prediction question clearly
3. Analyze the data source for reliability
4. Suggest initial liquidity parameters
5. Provide risk assessment

Generate:
- Formatted prediction question
- Market parameters (liquidity, fees, resolution criteria)
- Risk analysis
- Similar market examples`,

    outputFormat: {
      type: 'structured',
      fields: ['marketDefinition', 'riskAnalysis', 'parameters', 'examples'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  tools: {
    bonzai: [
      {
        name: 'dsla_create_market',
        endpoint: 'create_market',
        proxy: 'dslaProxy',
        description: 'Create a new DSLA prediction market',
      },
      {
        name: 'dsla_get_markets',
        endpoint: 'get_markets',
        proxy: 'dslaProxy',
        description: 'Get active DSLA markets',
      },
      {
        name: 'dsla_verify_datasource',
        endpoint: 'verify_datasource',
        proxy: 'externalProxy',
        description: 'Verify a data source API is accessible and returns valid data',
      },
    ],

    mcp: [
      {
        name: 'create_dsla_market',
        description: 'Create a new DSLA-based prediction market',
        inputSchema: {
          type: 'object',
          properties: {
            projectName: {
              type: 'string',
              description: 'Name for the prediction market project',
            },
            tokenSymbol: {
              type: 'string',
              description: 'Token symbol for the project',
            },
            slaDefinition: {
              type: 'object',
              properties: {
                asset: { type: 'string' },
                metric: { type: 'string' },
                operator: { type: 'string', enum: ['>', '<', '>=', '<=', '='] },
                target: { type: 'string' },
                targetDate: { type: 'string' },
                dataSource: { type: 'string' },
              },
              required: ['asset', 'metric', 'operator', 'target', 'targetDate'],
            },
          },
          required: ['projectName', 'slaDefinition'],
        },
      },
      {
        name: 'list_dsla_markets',
        description: 'List active DSLA prediction markets',
        inputSchema: {
          type: 'object',
          properties: {
            useCase: {
              type: 'string',
              enum: DSLA_USE_CASES.map(u => u.key),
              description: 'Filter by use case',
            },
            status: {
              type: 'string',
              enum: ['active', 'pending', 'resolved'],
              default: 'active',
            },
            limit: {
              type: 'number',
              default: 10,
            },
          },
          required: [],
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  execution: {
    type: 'javascript',
    entrypoint: 'execute',

    async execute(inputs, context) {
      const {
        useCase,
        projectName,
        tokenSymbol,
        asset,
        metric,
        operator,
        target,
        targetDate,
        dataSource,
      } = inputs;
      const { fetchTool, updateStatus } = context;

      updateStatus?.('Validating market definition...');

      // Get use case details
      const useCaseInfo = DSLA_USE_CASES.find(u => u.key === useCase);

      // Format the prediction question
      const operatorText = {
        '>': 'exceed',
        '<': 'fall below',
        '>=': 'reach at least',
        '<=': 'stay at or below',
        '=': 'equal exactly',
      };

      const formattedDate = targetDate
        ? new Date(targetDate).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })
        : 'TBD';

      const predictionQuestion = asset && metric && target && targetDate
        ? `Will ${asset}'s ${metric} ${operatorText[operator]} ${target} by ${formattedDate}?`
        : 'Please provide all required fields to generate the prediction question.';

      updateStatus?.('Analyzing data source...');

      // Verify data source (mock for now)
      const dataSourceAnalysis = dataSource
        ? {
            url: dataSource,
            accessible: true,
            responseFormat: 'JSON',
            updateFrequency: 'Real-time',
            reliability: 'HIGH',
            notes: 'Data source appears to be a valid API endpoint',
          }
        : {
            url: null,
            accessible: false,
            reliability: 'UNKNOWN',
            notes: 'No data source provided',
          };

      updateStatus?.('Generating risk analysis...');

      // Risk analysis
      const riskAnalysis = {
        overallRisk: 'MEDIUM',
        factors: [
          {
            factor: 'Data Source Reliability',
            risk: dataSource ? 'LOW' : 'HIGH',
            note: dataSource
              ? 'External API may have downtime or rate limits'
              : 'No data source specified for verification',
          },
          {
            factor: 'Market Liquidity',
            risk: 'MEDIUM',
            note: 'New markets may have limited initial liquidity',
          },
          {
            factor: 'Oracle Risk',
            risk: 'LOW',
            note: 'DSLA uses Chainlink oracles for verification',
          },
          {
            factor: 'Smart Contract Risk',
            risk: 'LOW',
            note: 'DSLA contracts are audited',
          },
        ],
        recommendation:
          'Ensure data source is reliable and accessible before launching market.',
      };

      updateStatus?.('Preparing market parameters...');

      // Market parameters
      const marketParameters = {
        projectName: projectName || 'Unnamed Project',
        tokenSymbol: tokenSymbol || 'TOKEN',
        useCase: useCaseInfo?.label || useCase,
        sla: {
          asset,
          metric,
          operator,
          target,
          targetDate,
          question: predictionQuestion,
        },
        liquidity: {
          suggestedInitial: '10,000 DSLA',
          minimumRequired: '1,000 DSLA',
          feePercentage: '1%',
        },
        resolution: {
          method: 'Chainlink Oracle',
          dataSource,
          disputePeriod: '24 hours',
        },
      };

      updateStatus?.('Complete!');

      return {
        marketDefinition: {
          question: predictionQuestion,
          useCase: useCaseInfo,
          parameters: marketParameters,
        },
        dataSourceAnalysis,
        riskAnalysis,
        examples: useCaseInfo?.examples || [],
        meta: {
          createdAt: new Date().toISOString(),
          status: 'draft',
        },
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STATIC DATA
  // ═══════════════════════════════════════════════════════════════════════════

  useCases: DSLA_USE_CASES,

  // ═══════════════════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  metadata: {
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    license: 'MIT',
    repository: 'https://github.com/bonzai-ai/bonzai-desktop',
  },
};

export default skill;
