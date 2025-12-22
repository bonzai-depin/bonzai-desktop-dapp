/**
 * Polymarket Copy-Trading Agent
 *
 * This agent connects to Polymarket data endpoints to identify
 * high-interest markets and the most influential traders within each.
 * It surfaces traders' current positions and suggests copy trades
 * with configurable position sizing.
 *
 * REQUIREMENTS:
 * - Purchase: 0.1 ETH (one-time to own the agent)
 * - Running Fee: 99 BONZAI (paid per execution)
 *
 * NOTE: Uses Electron's main process proxy to bypass CORS restrictions.
 * The proxy is exposed via window.polymarketProxy.
 */

const PolymarketCopyTrader = {
  // ═══════════════════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  id: "polymarket-copy-trader",
  name: "Polymarket Copy Trader",
  version: "1.0.0",

  description:
    "Identify the hottest markets and whales on Polymarket and mirror their positions with a smaller stake.",

  category: "trading",

  thumbnail: "/agents/polymarket-copy-trader.png",

  author: {
    name: "BonzAI",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESS REQUIREMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  requirements: {
    // One-time purchase price to own the agent
    purchasePrice: {
      amount: "0.1",
      token: "ETH",
    },

    // Running fee: PAID (transferred) per execution, not just held
    runningFee: {
      amount: 99,
      token: "BONZAI",
      description: "99 BONZAI is transferred to treasury each time you run this agent",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURABLE INPUTS
  // ═══════════════════════════════════════════════════════════════════════════

  inputs: {
    numMarkets: {
      type: "number",
      default: 3,
      min: 1,
      max: 10,
      label: "Number of markets to analyze",
      description: "How many top markets by 24h volume to scan",
    },

    copyFraction: {
      type: "number",
      default: 0.1,
      min: 0.01,
      max: 1,
      step: 0.01,
      label: "Copy fraction",
      description: "Fraction of whale position to replicate (0.1 = 10%)",
    },

    minVolume: {
      type: "number",
      default: 10000,
      label: "Minimum 24h volume ($)",
      description: "Only consider markets with at least this volume",
    },

    excludeResolved: {
      type: "boolean",
      default: true,
      label: "Exclude resolved markets",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Main execution entry point
   * NOTE: The calling code (agent.service.js) handles fee payment BEFORE
   * calling this method. This method focuses purely on the agent logic.
   *
   * @param {Object} inputs - User-provided configuration
   * @param {Object} context - Execution context with updateStatus callback
   * @returns {Promise<Object>} Results with recommendations
   */
  async execute(inputs, context) {
    const results = {
      timestamp: new Date().toISOString(),
      markets: [],
      summary: null,
      errors: [],
    };

    // Validate inputs
    const numMarkets = Math.max(
      1,
      Math.min(10, Math.floor(inputs.numMarkets || 3))
    );
    let copyFraction = parseFloat(inputs.copyFraction);
    if (Number.isNaN(copyFraction) || copyFraction <= 0 || copyFraction > 1) {
      copyFraction = 0.1;
    }
    const minVolume = inputs.minVolume || 10000;

    try {
      // Step 1: Fetch top markets by volume
      context.updateStatus?.("Fetching top markets by 24h volume...");

      const marketsResponse = await this.fetchFromPolymarket("markets", {
        limit: numMarkets * 2, // Fetch extra in case some are filtered
        active: "true",
        closed: "false",
      });

      if (!marketsResponse.success) {
        throw new Error(`Markets fetch failed: ${marketsResponse.error}`);
      }

      let markets = marketsResponse.data;

      if (!Array.isArray(markets)) {
        throw new Error("Unexpected response format from markets endpoint");
      }

      // Filter and sort
      markets = markets
        .filter((m) => {
          if (!m.volume24hr || m.volume24hr < minVolume) return false;
          if (inputs.excludeResolved && m.resolved) return false;
          return true;
        })
        .sort((a, b) => (b.volume24hr || 0) - (a.volume24hr || 0))
        .slice(0, numMarkets);

      if (markets.length === 0) {
        results.summary = {
          marketsAnalyzed: 0,
          totalRecommendations: 0,
          message: "No markets found matching criteria",
        };
        return results;
      }

      // Step 2: Fetch whale positions for each market
      context.updateStatus?.(`Analyzing ${markets.length} markets...`);

      for (let i = 0; i < markets.length; i++) {
        const market = markets[i];
        context.updateStatus?.(
          `Analyzing market ${i + 1}/${markets.length}: ${market.question?.substring(0, 50)}...`
        );

        try {
          const marketAnalysis = await this.analyzeMarket(
            market,
            copyFraction,
            context
          );
          results.markets.push(marketAnalysis);
        } catch (e) {
          results.errors.push({
            market: market.question,
            error: e.message,
          });
        }
      }

      // Step 3: Generate summary
      const totalRecommendations = results.markets.reduce(
        (sum, m) => sum + (m.recommendations?.length || 0),
        0
      );

      results.summary = {
        marketsAnalyzed: results.markets.length,
        totalRecommendations,
        totalVolume24h: results.markets.reduce(
          (sum, m) => sum + (m.volume24hr || 0),
          0
        ),
        generatedAt: new Date().toISOString(),
        copyFraction,
      };

      context.updateStatus?.("Analysis complete!");
      return results;
    } catch (error) {
      results.errors.push({ general: error.message });
      results.summary = {
        marketsAnalyzed: 0,
        totalRecommendations: 0,
        error: error.message,
      };
      return results;
    }
  },

  /**
   * Analyze a single market for whale positions
   */
  async analyzeMarket(market, copyFraction, context) {
    const { question, conditionId, outcomes, volume24hr, endDate } = market;

    // Fetch top holders
    const holdersResponse = await this.fetchFromPolymarket("holders", {
      market: conditionId,
      limit: 10,
    });

    if (!holdersResponse.success) {
      throw new Error(`Holders fetch failed: ${holdersResponse.error}`);
    }

    const holderData = holdersResponse.data;

    // Parse outcomes
    let outcomeLabels;
    try {
      outcomeLabels =
        typeof outcomes === "string" ? JSON.parse(outcomes) : outcomes;
    } catch {
      outcomeLabels = outcomes || [];
    }

    // Flatten holders across outcomes
    const traders = [];
    for (const token of holderData || []) {
      if (!Array.isArray(token.holders)) continue;
      for (const h of token.holders) {
        traders.push({
          outcomeIndex: h.outcomeIndex,
          amount: parseFloat(h.amount) || 0,
          name: h.name || h.pseudonym || this.truncateAddress(h.proxyWallet),
          wallet: h.proxyWallet,
        });
      }
    }

    // Sort by position size
    traders.sort((a, b) => b.amount - a.amount);

    // Build recommendations (one per outcome, top whale)
    const recommendations = [];
    const seenOutcomes = new Set();

    for (const trader of traders) {
      if (seenOutcomes.has(trader.outcomeIndex)) continue;
      seenOutcomes.add(trader.outcomeIndex);

      const outcomeLabel =
        outcomeLabels[trader.outcomeIndex] || `Outcome ${trader.outcomeIndex}`;
      const suggestedSize = (trader.amount * copyFraction).toFixed(2);

      recommendations.push({
        outcome: outcomeLabel,
        outcomeIndex: trader.outcomeIndex,
        whaleTrader: trader.name,
        whaleWallet: trader.wallet,
        whalePosition: trader.amount,
        suggestedPosition: parseFloat(suggestedSize),
        copyFraction: copyFraction,
      });
    }

    return {
      question,
      conditionId,
      volume24hr,
      endDate,
      outcomes: outcomeLabels,
      recommendations,
      topWhales: traders.slice(0, 5).map((t) => ({
        name: t.name,
        position: t.amount,
        outcome: outcomeLabels[t.outcomeIndex] || `Outcome ${t.outcomeIndex}`,
      })),
    };
  },

  /**
   * Fetch from Polymarket via Electron's main process proxy
   * This bypasses CORS restrictions
   */
  async fetchFromPolymarket(endpoint, params) {
    // Check if we're in Electron with the proxy available
    if (typeof window !== "undefined" && window.polymarketProxy) {
      return window.polymarketProxy.fetch(endpoint, params);
    }

    // Fallback for non-Electron environments (e.g., testing in Node.js)
    const urls = {
      markets: "https://gamma-api.polymarket.com/markets",
      holders: "https://data-api.polymarket.com/holders",
      events: "https://gamma-api.polymarket.com/events",
    };

    const url = new URL(urls[endpoint] || endpoint);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          url.searchParams.append(k, String(v));
        }
      });
    }

    try {
      const res = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}` };
      }
      return { success: true, data: await res.json() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /**
   * Truncate wallet address for display
   */
  truncateAddress(addr) {
    if (!addr) return "Unknown";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  },
};

export default PolymarketCopyTrader;
