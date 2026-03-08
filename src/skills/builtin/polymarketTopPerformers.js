/**
 * Polymarket Top Performers Skill
 *
 * A decentralized Claude skill for analyzing top PnL traders on Polymarket
 * and identifying high-conviction positions where multiple winners agree.
 *
 * Works in:
 * - BonzAI Desktop App (via Electron proxy)
 * - Claude Code CLI (via MCP server)
 */

import { SKILL_SCHEMA_VERSION } from '../types.js';

export const skill = {
  schema_version: SKILL_SCHEMA_VERSION,

  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════════════════

  id: 'polymarket-top-performers-v1.0.0',
  name: 'Polymarket Top Performers',
  description:
    'Analyze top PnL traders on Polymarket and find positions where multiple winners agree. Get copy-trading recommendations based on collective whale intelligence.',
  version: '1.0.0',

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHOR & CATEGORY
  // ═══════════════════════════════════════════════════════════════════════════

  author: {
    address: '0x0000000000000000000000000000000000000000', // Will be set on-chain
    name: 'BonzAI',
    verified: true,
  },

  category: 'finance',
  purchasePrice: '0.1', // 0.1 ETH one-time purchase fee

  // ═══════════════════════════════════════════════════════════════════════════
  // REQUIREMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  requirements: {
    minLevel: 1,
    requiredApis: ['polymarket'],
    requiredPermissions: ['network:read'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUTS
  // ═══════════════════════════════════════════════════════════════════════════

  inputs: {
    numTraders: {
      type: 'number',
      default: 10,
      min: 1,
      max: 20,
      label: 'Top traders to analyze',
      description: 'Number of top PnL traders to fetch from leaderboard',
    },
    timePeriod: {
      type: 'select',
      default: 'WEEK',
      options: ['DAY', 'WEEK', 'MONTH', 'ALL'],
      label: 'Performance period',
      description: 'Time period for PnL leaderboard ranking',
    },
    minConviction: {
      type: 'number',
      default: 2,
      min: 1,
      max: 10,
      label: 'Minimum conviction',
      description: 'Minimum number of traders that must agree on a position',
    },
    copyFraction: {
      type: 'number',
      default: 0.1,
      min: 0.01,
      max: 1,
      label: 'Copy fraction',
      description: 'Fraction of average whale position to copy (0.1 = 10%)',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROMPT TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════

  prompt: {
    system: `You are an expert prediction market analyst specializing in Polymarket copy-trading strategies.

Your role is to:
1. Analyze data from top-performing traders on Polymarket
2. Identify high-conviction positions where multiple winners agree
3. Provide actionable copy-trading recommendations
4. Assess risk and potential returns

Be data-driven, concise, and highlight:
- Positions with highest trader agreement (conviction)
- Current market prices and potential upside
- Risk factors and position sizing suggestions

Format recommendations clearly with:
- Market question and outcome
- Number of agreeing traders and their combined position
- Suggested position size
- Market URL for easy access`,

    task: `Analyze Polymarket using these parameters:
- Number of top traders: {{numTraders}}
- Performance period: {{timePeriod}}
- Minimum conviction (traders agreeing): {{minConviction}}
- Copy fraction: {{copyFraction}}

Execute the following analysis:
1. Fetch the top {{numTraders}} traders by PnL for the {{timePeriod}} period
2. Retrieve each trader's current active positions
3. Aggregate positions by market and outcome
4. Filter for positions where {{minConviction}}+ traders agree
5. Generate copy-trading recommendations

For each recommendation, provide:
- Market question and recommended outcome
- Conviction score (how many top traders hold this position)
- Total size held by these traders
- Suggested position size (based on {{copyFraction}} of average)
- Current market price
- Direct link to the market

Prioritize positions with:
- Higher trader agreement
- Larger total position sizes
- Better risk/reward based on current prices`,

    outputFormat: {
      type: 'structured',
      fields: ['topTraders', 'recommendations', 'meta'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  tools: {
    // Tools for BonzAI app (via Electron proxy)
    bonzai: [
      {
        name: 'polymarket_leaderboard',
        endpoint: 'leaderboard',
        proxy: 'polymarketProxy',
        description: 'Fetch top performing traders from Polymarket leaderboard by PnL',
      },
      {
        name: 'polymarket_positions',
        endpoint: 'positions',
        proxy: 'polymarketProxy',
        description: 'Get all active positions for a specific trader wallet',
      },
      {
        name: 'polymarket_markets',
        endpoint: 'markets',
        proxy: 'polymarketProxy',
        description: 'Get market information including current prices',
      },
    ],

    // Tools for Claude Code (via MCP)
    mcp: [
      {
        name: 'fetch_polymarket_leaderboard',
        description:
          'Fetch top performing traders from Polymarket leaderboard ranked by PnL',
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['OVERALL', 'POLITICS', 'SPORTS', 'CRYPTO', 'POP_CULTURE'],
              default: 'OVERALL',
              description: 'Market category to filter leaderboard',
            },
            timePeriod: {
              type: 'string',
              enum: ['DAY', 'WEEK', 'MONTH', 'ALL'],
              default: 'WEEK',
              description: 'Time period for PnL calculation',
            },
            orderBy: {
              type: 'string',
              enum: ['PNL', 'VOLUME'],
              default: 'PNL',
              description: 'Sort metric',
            },
            limit: {
              type: 'number',
              default: 10,
              minimum: 1,
              maximum: 100,
              description: 'Number of traders to return',
            },
          },
          required: [],
        },
      },
      {
        name: 'fetch_trader_positions',
        description: 'Get all active positions for a specific Polymarket trader',
        inputSchema: {
          type: 'object',
          properties: {
            user: {
              type: 'string',
              description: 'Trader proxy wallet address',
            },
            sizeThreshold: {
              type: 'number',
              default: 100,
              description: 'Minimum position size in USD to include',
            },
            limit: {
              type: 'number',
              default: 50,
              description: 'Maximum positions to return',
            },
            sortBy: {
              type: 'string',
              enum: ['CURRENT', 'SIZE', 'PNL'],
              default: 'CURRENT',
              description: 'Sort order for positions',
            },
          },
          required: ['user'],
        },
      },
      {
        name: 'fetch_market_info',
        description: 'Get detailed information about a specific Polymarket market',
        inputSchema: {
          type: 'object',
          properties: {
            conditionId: {
              type: 'string',
              description: 'Market condition ID',
            },
            slug: {
              type: 'string',
              description: 'Market event slug',
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

    /**
     * Execute the skill
     * @param {Object} inputs - Validated user inputs
     * @param {Object} context - Execution context with tool access
     * @returns {Promise<Object>}
     */
    async execute(inputs, context) {
      const { numTraders, timePeriod, minConviction, copyFraction } = inputs;
      const { fetchTool, updateStatus } = context;

      updateStatus?.('Fetching top traders from leaderboard...');

      // Step 1: Fetch leaderboard
      const leaderboardData = await fetchTool('polymarket_leaderboard', {
        category: 'OVERALL',
        timePeriod,
        orderBy: 'PNL',
        limit: numTraders,
      });

      if (!Array.isArray(leaderboardData) || leaderboardData.length === 0) {
        throw new Error('No traders found on leaderboard');
      }

      const topTraders = leaderboardData
        .filter((t) => t.pnl > 0)
        .map((t) => ({
          rank: t.rank,
          proxyWallet: t.proxyWallet,
          userName: t.userName || `Trader ${t.rank}`,
          pnl: t.pnl,
          vol: t.vol,
          profileImage: t.profileImage,
        }));

      // Step 2: Fetch positions for each trader
      updateStatus?.(`Fetching positions for ${topTraders.length} traders...`);

      const traderPositions = await Promise.all(
        topTraders.map(async (trader) => {
          try {
            const positions = await fetchTool('polymarket_positions', {
              user: trader.proxyWallet,
              sizeThreshold: 100,
              limit: 50,
              sortBy: 'CURRENT',
            });

            const activePositions = (positions || []).filter(
              (p) => !p.redeemable && p.size > 100 && p.title && p.outcome
            );

            return { trader, positions: activePositions };
          } catch (e) {
            console.warn(`Failed to fetch positions for ${trader.userName}:`, e.message);
            return { trader, positions: [] };
          }
        })
      );

      // Step 3: Aggregate positions by conviction
      updateStatus?.('Analyzing positions for conviction signals...');

      const positionMap = new Map();

      for (const { trader, positions } of traderPositions) {
        for (const pos of positions) {
          const key = `${pos.conditionId}|${pos.outcome}`;

          if (!positionMap.has(key)) {
            positionMap.set(key, {
              conditionId: pos.conditionId,
              title: pos.title,
              outcome: pos.outcome,
              eventSlug: pos.eventSlug || pos.slug,
              curPrice: pos.curPrice,
              endDate: pos.endDate,
              traders: [],
              totalSize: 0,
              totalPnl: 0,
            });
          }

          const agg = positionMap.get(key);
          agg.traders.push({
            userName: trader.userName,
            proxyWallet: trader.proxyWallet,
            rank: trader.rank,
            size: pos.size,
            avgPrice: pos.avgPrice,
            cashPnl: pos.cashPnl,
          });
          agg.totalSize += pos.size;
          agg.totalPnl += pos.cashPnl || 0;
        }
      }

      // Step 4: Filter and sort by conviction
      const aggregatedPositions = Array.from(positionMap.values())
        .filter((p) => p.traders.length >= minConviction)
        .sort((a, b) => {
          if (b.traders.length !== a.traders.length) {
            return b.traders.length - a.traders.length;
          }
          return b.totalSize - a.totalSize;
        });

      // Step 5: Build recommendations
      const recommendations = aggregatedPositions.slice(0, 10).map((pos) => {
        const avgSize = pos.totalSize / pos.traders.length;
        const suggestedSize = Math.round(avgSize * copyFraction * 100) / 100;

        return {
          question: pos.title,
          outcome: pos.outcome,
          slug: pos.eventSlug,
          url: `https://polymarket.com/event/${pos.eventSlug}`,
          conviction: {
            traderCount: pos.traders.length,
            totalSize: Math.round(pos.totalSize * 100) / 100,
            avgPnl: Math.round((pos.totalPnl / pos.traders.length) * 100) / 100,
          },
          traders: pos.traders.map((t) => ({
            userName: t.userName,
            rank: t.rank,
            size: Math.round(t.size * 100) / 100,
            entryPrice: t.avgPrice,
          })),
          market: {
            currentPrice: pos.curPrice,
            endDate: pos.endDate,
          },
          suggestedSize,
        };
      });

      updateStatus?.('Analysis complete!');

      return {
        topTraders: topTraders.map((t) => {
          const td = traderPositions.find((tp) => tp.trader.proxyWallet === t.proxyWallet);
          return { ...t, positionCount: td?.positions?.length || 0 };
        }),
        recommendations,
        meta: {
          analyzedAt: new Date().toISOString(),
          timePeriod,
          tradersAnalyzed: topTraders.length,
          positionsScanned: traderPositions.reduce((sum, tp) => sum + tp.positions.length, 0),
          minConviction,
          positionsWithConviction: aggregatedPositions.length,
        },
      };
    },
  },

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
