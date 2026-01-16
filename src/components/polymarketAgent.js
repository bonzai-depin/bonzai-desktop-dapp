/*
 * Polymarket Top Performers Copy-Trading Agent
 *
 * This agent identifies the highest performing traders on Polymarket's
 * leaderboard and analyzes their current positions. It then finds positions
 * where multiple top performers agree (high conviction) and suggests copy
 * trades based on collective whale intelligence.
 *
 * Strategy: If the best traders are all betting on the same outcome,
 * that's a strong signal worth following.
 *
 * NOTE: This agent uses the Electron proxy (window.polymarketProxy) to
 * bypass CORS restrictions when fetching from Polymarket endpoints.
 * The proxy is defined in preload.js and handled in main.js.
 */

export default {
  /**
   * A human readable name for the agent. This appears in the UI.
   */
  name: 'Polymarket Top Performers',

  /**
   * A short description explaining what the agent does.
   */
  description: 'Analyze top PnL traders on Polymarket and find positions where multiple winners agree.',

  /**
   * Category for marketplace organization.
   */
  category: 'analysis',

  /**
   * Input fields for user customization.
   */
  inputs: {
    numTraders: {
      type: 'number',
      default: 10,
      label: 'Top traders to analyze'
    },
    timePeriod: {
      type: 'string',
      default: 'WEEK',
      label: 'Performance period (DAY, WEEK, MONTH)'
    },
    minConviction: {
      type: 'number',
      default: 2,
      label: 'Min traders agreeing on position'
    },
    copyFraction: {
      type: 'number',
      default: 0.1,
      label: 'Fraction of average position to copy'
    }
  },

  /**
   * Main execution entry point.
   *
   * @param {Object} inputs - User provided input values merged with defaults.
   * @param {Object} context - Execution context.
   * @returns {Promise<Object>} Results including top traders and recommendations.
   */
  async execute(inputs, context) {
    // Validate inputs
    const numTraders = Math.max(1, Math.min(20, Math.floor(inputs.numTraders || 10)));
    const timePeriod = ['DAY', 'WEEK', 'MONTH', 'ALL'].includes(inputs.timePeriod)
      ? inputs.timePeriod
      : 'WEEK';
    const minConviction = Math.max(1, Math.min(10, Math.floor(inputs.minConviction || 2)));
    let copyFraction = parseFloat(inputs.copyFraction);
    if (Number.isNaN(copyFraction) || copyFraction <= 0 || copyFraction > 1) {
      copyFraction = 0.1;
    }

    /**
     * Helper to fetch JSON via the Electron proxy to bypass CORS.
     */
    const fetchViaProxy = async (endpoint, params = {}) => {
      if (window.polymarketProxy?.fetch) {
        const result = await window.polymarketProxy.fetch(endpoint, params);
        if (!result.success) {
          throw new Error(result.error || `Request failed for ${endpoint}`);
        }
        return result.data;
      }
      if (window.externalProxy?.get) {
        const baseUrls = {
          markets: 'https://gamma-api.polymarket.com/markets',
          holders: 'https://data-api.polymarket.com/holders',
          events: 'https://gamma-api.polymarket.com/events',
          leaderboard: 'https://data-api.polymarket.com/v1/leaderboard',
          positions: 'https://data-api.polymarket.com/positions',
        };
        const baseUrl = baseUrls[endpoint] || endpoint;
        const url = new URL(baseUrl);
        Object.entries(params).forEach(([key, val]) => {
          if (val !== undefined && val !== null) {
            url.searchParams.append(key, String(val));
          }
        });
        const result = await window.externalProxy.get(url.toString());
        if (!result.success) {
          throw new Error(result.error || `Request failed for ${endpoint}`);
        }
        return result.data;
      }
      throw new Error(
        'Polymarket proxy not available. Please ensure you are running in Electron with the preload script loaded.'
      );
    };

    // =========================================================================
    // STEP 1: Fetch top performers from leaderboard
    // =========================================================================
    console.log(`[Polymarket Agent] Fetching top ${numTraders} traders (${timePeriod} PnL)...`);

    const leaderboardData = await fetchViaProxy('leaderboard', {
      category: 'OVERALL',
      timePeriod: timePeriod,
      orderBy: 'PNL',
      limit: numTraders
    });

    if (!Array.isArray(leaderboardData) || leaderboardData.length === 0) {
      throw new Error('No traders found on leaderboard');
    }

    // Filter for traders with positive PnL
    const topTraders = leaderboardData
      .filter(t => t.pnl > 0)
      .map(t => ({
        rank: t.rank,
        proxyWallet: t.proxyWallet,
        userName: t.userName || `Trader ${t.rank}`,
        pnl: t.pnl,
        vol: t.vol,
        profileImage: t.profileImage,
        xUsername: t.xUsername,
        verifiedBadge: t.verifiedBadge
      }));

    console.log(`[Polymarket Agent] Top traders:`, topTraders.map(t => `${t.userName} ($${Math.round(t.pnl).toLocaleString()})`));

    // =========================================================================
    // STEP 2: Fetch each trader's positions (in parallel)
    // =========================================================================
    console.log(`[Polymarket Agent] Fetching positions for ${topTraders.length} traders...`);

    const positionPromises = topTraders.map(async (trader) => {
      try {
        const positions = await fetchViaProxy('positions', {
          user: trader.proxyWallet,
          sizeThreshold: 100,  // Only significant positions
          limit: 50,
          sortBy: 'CURRENT',
          sortDirection: 'DESC'
        });

        if (!Array.isArray(positions)) {
          return { trader, positions: [] };
        }

        // Filter for active (non-redeemable) positions with meaningful size
        const activePositions = positions.filter(p =>
          !p.redeemable &&
          p.size > 100 &&
          p.title &&
          p.outcome
        );

        console.log(`[Polymarket Agent] ${trader.userName}: ${activePositions.length} active positions`);
        return { trader, positions: activePositions };
      } catch (e) {
        console.warn(`[Polymarket Agent] Failed to fetch positions for ${trader.userName}:`, e.message);
        return { trader, positions: [] };
      }
    });

    const traderPositions = await Promise.all(positionPromises);

    // =========================================================================
    // STEP 3: Aggregate positions by market+outcome (conviction scoring)
    // =========================================================================
    console.log('[Polymarket Agent] Aggregating positions by conviction...');

    // Map: "conditionId|outcome" -> aggregated position data
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
            eventId: pos.eventId,
            endDate: pos.endDate,
            curPrice: pos.curPrice,
            traders: [],
            totalSize: 0,
            totalPnl: 0
          });
        }

        const agg = positionMap.get(key);
        agg.traders.push({
          userName: trader.userName,
          proxyWallet: trader.proxyWallet,
          rank: trader.rank,
          traderPnl: trader.pnl,
          size: pos.size,
          avgPrice: pos.avgPrice,
          cashPnl: pos.cashPnl,
          percentPnl: pos.percentPnl
        });
        agg.totalSize += pos.size;
        agg.totalPnl += pos.cashPnl || 0;
      }
    }

    // Convert to array and filter by minimum conviction
    const aggregatedPositions = Array.from(positionMap.values())
      .filter(p => p.traders.length >= minConviction)
      .sort((a, b) => {
        // Sort by: 1) number of traders, 2) total size
        if (b.traders.length !== a.traders.length) {
          return b.traders.length - a.traders.length;
        }
        return b.totalSize - a.totalSize;
      });

    console.log(`[Polymarket Agent] Found ${aggregatedPositions.length} positions with ${minConviction}+ trader agreement`);

    // =========================================================================
    // STEP 4: Build recommendations
    // =========================================================================
    const recommendations = aggregatedPositions.slice(0, 10).map(pos => {
      const avgSize = pos.totalSize / pos.traders.length;
      const avgPnl = pos.totalPnl / pos.traders.length;
      const suggestedSize = Math.round(avgSize * copyFraction * 100) / 100;

      return {
        question: pos.title,
        slug: pos.eventSlug,
        outcome: pos.outcome,
        conviction: {
          traderCount: pos.traders.length,
          totalSize: Math.round(pos.totalSize * 100) / 100,
          avgPnl: Math.round(avgPnl * 100) / 100
        },
        traders: pos.traders.map(t => ({
          userName: t.userName,
          proxyWallet: t.proxyWallet,
          rank: t.rank,
          size: Math.round(t.size * 100) / 100,
          entryPrice: t.avgPrice,
          pnl: Math.round(t.cashPnl * 100) / 100
        })),
        market: {
          currentPrice: pos.curPrice,
          endDate: pos.endDate
        },
        suggestedSize
      };
    });

    // Log results
    console.log('[Polymarket Agent] Top recommendations:');
    recommendations.forEach((r, i) => {
      console.log(`  ${i + 1}. "${r.question}" -> ${r.outcome}`);
      console.log(`     Conviction: ${r.conviction.traderCount} traders, $${r.conviction.totalSize.toLocaleString()} total`);
      console.log(`     URL: https://polymarket.com/event/${r.slug}`);
    });

    // Augment topTraders with position count
    const tradersWithCounts = topTraders.map(t => {
      const traderData = traderPositions.find(tp => tp.trader.proxyWallet === t.proxyWallet);
      return {
        ...t,
        positionCount: traderData?.positions?.length || 0
      };
    });

    // =========================================================================
    // RETURN RESULTS
    // =========================================================================
    return {
      topTraders: tradersWithCounts,
      recommendations,
      meta: {
        analyzedAt: new Date().toISOString(),
        timePeriod,
        tradersAnalyzed: topTraders.length,
        positionsScanned: traderPositions.reduce((sum, tp) => sum + tp.positions.length, 0),
        minConviction
      }
    };
  }
};
