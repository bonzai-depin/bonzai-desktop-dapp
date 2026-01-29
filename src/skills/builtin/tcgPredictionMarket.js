/**
 * TCG Prediction Market Skill
 *
 * A decentralized Claude skill for trading card game price predictions.
 * Build portfolios and create/join prediction markets on card prices.
 *
 * Supported TCGs:
 * - Pokemon
 * - Magic: The Gathering
 * - Yu-Gi-Oh!
 * - One Piece
 * - Lorcana
 *
 * Works in:
 * - BonzAI Desktop App (via Electron proxy)
 * - Claude Code CLI (via MCP server)
 */

import { SKILL_SCHEMA_VERSION } from '../types.js';

const TCG_COLLECTIONS = [
  { id: 'pokemon', name: 'Pokemon', icon: 'amp_stories' },
  { id: 'mtg', name: 'Magic: The Gathering', icon: 'amp_stories' },
  { id: 'yugioh', name: 'Yu-Gi-Oh!', icon: 'amp_stories' },
  { id: 'onepiece', name: 'One Piece', icon: 'amp_stories' },
  { id: 'lorcana', name: 'Lorcana', icon: 'amp_stories' },
];

export const skill = {
  schema_version: SKILL_SCHEMA_VERSION,

  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════════════════

  id: 'tcg-insurance-v1.0.0',
  name: 'Trading Card Game Insurance',
  description:
    'Build your trading card portfolio and create or join prediction markets on card prices. Uses real-time pricing for Pokemon, Magic: The Gathering, Yu-Gi-Oh!, One Piece, and Lorcana.',
  version: '1.0.0',

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHOR & CATEGORY
  // ═══════════════════════════════════════════════════════════════════════════

  author: {
    address: '0x0000000000000000000000000000000000000000',
    name: 'BonzAI',
    verified: true,
  },

  category: 'finance',
  tags: ['demo'],

  // ═══════════════════════════════════════════════════════════════════════════
  // REQUIREMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  requirements: {
    minLevel: 1,
    requiredApis: ['justtcg'],
    requiredPermissions: ['network:read'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUTS
  // ═══════════════════════════════════════════════════════════════════════════

  inputs: {
    collection: {
      type: 'select',
      default: 'pokemon',
      options: ['pokemon', 'mtg', 'yugioh', 'onepiece', 'lorcana'],
      label: 'TCG Collection',
      description: 'The trading card game collection to analyze',
    },
    topCount: {
      type: 'number',
      default: 10,
      min: 5,
      max: 50,
      label: 'Top cards to display',
      description: 'Number of highest value cards to show',
    },
    priceChangeThreshold: {
      type: 'number',
      default: 10,
      min: 1,
      max: 100,
      label: 'Price change threshold (%)',
      description: 'Minimum price change percentage to highlight',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROMPT TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════

  prompt: {
    system: `You are an expert trading card game analyst and price predictor.

Your role is to:
1. Analyze card price trends and market movements
2. Identify cards with high price volatility or growth potential
3. Suggest prediction market opportunities based on historical data
4. Provide portfolio recommendations

Be data-driven and consider:
- Historical price movements
- Set releases and reprint announcements
- Tournament meta changes
- Collector demand patterns

Format recommendations clearly with:
- Card name and set
- Current price and historical trend
- Prediction market suggestion (e.g., "Price > $50 by March 2025")
- Confidence level and reasoning`,

    task: `Analyze TCG data using these parameters:
- Collection: {{collection}}
- Top cards to analyze: {{topCount}}
- Price change threshold: {{priceChangeThreshold}}%

Execute the following analysis:
1. Fetch top {{topCount}} highest-value cards from {{collection}}
2. Identify cards with significant price movements (>{{priceChangeThreshold}}% change)
3. Analyze trends and generate prediction market suggestions
4. Provide portfolio recommendations

For each recommendation, provide:
- Card name, set, and rarity
- Current market price
- Price history trend (up/down/stable)
- Suggested prediction market (with target price and date)
- Confidence score and reasoning`,

    outputFormat: {
      type: 'structured',
      fields: ['topCards', 'trendingCards', 'marketSuggestions', 'portfolioRecommendations'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  tools: {
    bonzai: [
      {
        name: 'tcg_top_cards',
        endpoint: 'top_cards',
        proxy: 'externalProxy',
        description: 'Fetch top value cards from a TCG collection',
      },
      {
        name: 'tcg_search_cards',
        endpoint: 'search_cards',
        proxy: 'externalProxy',
        description: 'Search cards by name within a collection',
      },
      {
        name: 'tcg_price_history',
        endpoint: 'price_history',
        proxy: 'externalProxy',
        description: 'Get price history for a specific card',
      },
    ],

    mcp: [
      {
        name: 'fetch_tcg_top_cards',
        description: 'Fetch top value trading cards from a collection',
        inputSchema: {
          type: 'object',
          properties: {
            collection: {
              type: 'string',
              enum: ['pokemon', 'mtg', 'yugioh', 'onepiece', 'lorcana'],
              default: 'pokemon',
              description: 'TCG collection to fetch from',
            },
            limit: {
              type: 'number',
              default: 10,
              minimum: 1,
              maximum: 50,
              description: 'Number of cards to return',
            },
          },
          required: ['collection'],
        },
      },
      {
        name: 'search_tcg_cards',
        description: 'Search for trading cards by name',
        inputSchema: {
          type: 'object',
          properties: {
            collection: {
              type: 'string',
              enum: ['pokemon', 'mtg', 'yugioh', 'onepiece', 'lorcana'],
              description: 'TCG collection to search',
            },
            query: {
              type: 'string',
              description: 'Card name search query',
            },
            limit: {
              type: 'number',
              default: 20,
              description: 'Maximum results to return',
            },
          },
          required: ['collection', 'query'],
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
      const { collection, topCount, priceChangeThreshold } = inputs;
      const { fetchTool, updateStatus } = context;

      updateStatus?.('Fetching top cards...');

      // Step 1: Fetch top cards (using mock data for now)
      const topCards = await this.getMockTopCards(collection, topCount);

      // Step 2: Identify trending cards
      updateStatus?.('Analyzing price trends...');
      const trendingCards = topCards.filter(
        (card) => Math.abs(card.priceChange || 0) >= priceChangeThreshold
      );

      // Step 3: Generate market suggestions
      updateStatus?.('Generating market suggestions...');
      const marketSuggestions = trendingCards.slice(0, 5).map((card) => {
        const isUptrend = (card.priceChange || 0) > 0;
        const targetMultiplier = isUptrend ? 1.2 : 0.8;
        const targetPrice = Math.round(card.price * targetMultiplier * 100) / 100;
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 3);

        return {
          card: {
            name: card.name,
            set: card.set,
            rarity: card.rarity,
          },
          currentPrice: card.price,
          priceChange: card.priceChange,
          prediction: {
            operator: isUptrend ? '>' : '<',
            targetPrice,
            targetDate: futureDate.toISOString().split('T')[0],
            question: `Will ${card.name}'s price ${isUptrend ? 'exceed' : 'fall below'} $${targetPrice} by ${futureDate.toLocaleDateString()}?`,
          },
          confidence: Math.min(95, 50 + Math.abs(card.priceChange || 0)),
          reasoning: isUptrend
            ? `Strong upward momentum with ${card.priceChange}% increase`
            : `Declining trend with ${Math.abs(card.priceChange)}% decrease`,
        };
      });

      // Step 4: Portfolio recommendations
      const portfolioRecommendations = topCards.slice(0, 3).map((card) => ({
        action: 'HOLD',
        card: card.name,
        reason: 'High value card with stable demand',
        riskLevel: 'MEDIUM',
      }));

      updateStatus?.('Analysis complete!');

      return {
        collection,
        topCards,
        trendingCards,
        marketSuggestions,
        portfolioRecommendations,
        meta: {
          analyzedAt: new Date().toISOString(),
          cardsAnalyzed: topCards.length,
          priceChangeThreshold,
        },
      };
    },

    // Mock data for development
    getMockTopCards(collection, limit) {
      const mockCards = {
        pokemon: [
          { id: 'p1', name: 'Charizard VMAX', set: 'Champion\'s Path', rarity: 'Ultra Rare', price: 350, priceChange: 15 },
          { id: 'p2', name: 'Pikachu VMAX', set: 'Vivid Voltage', rarity: 'Ultra Rare', price: 180, priceChange: 8 },
          { id: 'p3', name: 'Umbreon VMAX', set: 'Evolving Skies', rarity: 'Alternate Art', price: 420, priceChange: -5 },
          { id: 'p4', name: 'Mewtwo VSTAR', set: 'Crown Zenith', rarity: 'Secret Rare', price: 95, priceChange: 12 },
          { id: 'p5', name: 'Rayquaza VMAX', set: 'Evolving Skies', rarity: 'Alternate Art', price: 290, priceChange: 3 },
        ],
        mtg: [
          { id: 'm1', name: 'Black Lotus', set: 'Alpha', rarity: 'Rare', price: 150000, priceChange: 5 },
          { id: 'm2', name: 'Mox Sapphire', set: 'Beta', rarity: 'Rare', price: 8500, priceChange: -3 },
          { id: 'm3', name: 'Time Walk', set: 'Alpha', rarity: 'Rare', price: 12000, priceChange: 2 },
          { id: 'm4', name: 'Ancestral Recall', set: 'Alpha', rarity: 'Rare', price: 18000, priceChange: 8 },
          { id: 'm5', name: 'Underground Sea', set: 'Revised', rarity: 'Rare', price: 650, priceChange: -1 },
        ],
        yugioh: [
          { id: 'y1', name: 'Blue-Eyes White Dragon', set: 'LOB', rarity: '1st Edition', price: 2500, priceChange: 10 },
          { id: 'y2', name: 'Dark Magician', set: 'LOB', rarity: '1st Edition', price: 1200, priceChange: 5 },
          { id: 'y3', name: 'Exodia the Forbidden One', set: 'LOB', rarity: '1st Edition', price: 800, priceChange: -2 },
          { id: 'y4', name: 'Pot of Greed', set: 'LOB', rarity: '1st Edition', price: 150, priceChange: 15 },
          { id: 'y5', name: 'Monster Reborn', set: 'LOB', rarity: '1st Edition', price: 180, priceChange: 3 },
        ],
        onepiece: [
          { id: 'o1', name: 'Monkey D. Luffy', set: 'OP01', rarity: 'Leader', price: 45, priceChange: 20 },
          { id: 'o2', name: 'Roronoa Zoro', set: 'OP01', rarity: 'Super Rare', price: 85, priceChange: 12 },
          { id: 'o3', name: 'Nami', set: 'OP01', rarity: 'Super Rare', price: 35, priceChange: 8 },
          { id: 'o4', name: 'Shanks', set: 'OP01', rarity: 'Secret Rare', price: 250, priceChange: -5 },
          { id: 'o5', name: 'Yamato', set: 'OP02', rarity: 'Secret Rare', price: 180, priceChange: 25 },
        ],
        lorcana: [
          { id: 'l1', name: 'Elsa, Snow Queen', set: 'The First Chapter', rarity: 'Enchanted', price: 450, priceChange: -10 },
          { id: 'l2', name: 'Mickey Mouse, True Friend', set: 'The First Chapter', rarity: 'Enchanted', price: 280, priceChange: 5 },
          { id: 'l3', name: 'Stitch, Carefree Surfer', set: 'The First Chapter', rarity: 'Super Rare', price: 85, priceChange: 15 },
          { id: 'l4', name: 'Belle, Strange But Special', set: 'Rise of the Floodborn', rarity: 'Enchanted', price: 320, priceChange: 8 },
          { id: 'l5', name: 'Simba, Future King', set: 'Rise of the Floodborn', rarity: 'Legendary', price: 45, priceChange: 3 },
        ],
      };

      return (mockCards[collection] || mockCards.pokemon).slice(0, limit);
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
