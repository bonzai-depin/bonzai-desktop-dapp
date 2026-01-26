/**
 * Polymarket API Client
 *
 * Fetches data from Polymarket's public APIs for use in MCP tools.
 * No authentication required for read-only operations.
 */

// ═══════════════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

const ENDPOINTS = {
  leaderboard: "https://data-api.polymarket.com/v1/leaderboard",
  positions: "https://data-api.polymarket.com/positions",
  markets: "https://gamma-api.polymarket.com/markets",
  events: "https://gamma-api.polymarket.com/events",
  holders: "https://data-api.polymarket.com/holders",
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface LeaderboardEntry {
  rank: number;
  proxyWallet: string;
  userName: string;
  pnl: number;
  vol: number;
  profileImage?: string;
  xUsername?: string;
  verifiedBadge?: boolean;
}

interface Position {
  conditionId: string;
  title: string;
  outcome: string;
  eventSlug?: string;
  slug?: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  cashPnl: number;
  percentPnl: number;
  redeemable: boolean;
  endDate?: string;
}

interface Market {
  conditionId: string;
  question: string;
  outcomes: string | string[];
  volume24hr: number;
  liquidity: number;
  resolved: boolean;
  endDate?: string;
}

interface CopyTradeRecommendation {
  question: string;
  outcome: string;
  slug: string;
  url: string;
  conviction: {
    traderCount: number;
    totalSize: number;
    avgPnl: number;
  };
  traders: {
    userName: string;
    rank: number;
    size: number;
    entryPrice: number;
  }[];
  market: {
    currentPrice: number;
    endDate?: string;
  };
  suggestedSize: number;
}

interface CopyTradeAnalysis {
  topTraders: (LeaderboardEntry & { positionCount: number })[];
  recommendations: CopyTradeRecommendation[];
  meta: {
    analyzedAt: string;
    timePeriod: string;
    tradersAnalyzed: number;
    positionsScanned: number;
    minConviction: number;
    positionsWithConviction: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// POLYMARKET API CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class PolymarketAPI {
  /**
   * Fetch top performers from leaderboard
   */
  async fetchLeaderboard(
    category: string = "OVERALL",
    timePeriod: string = "WEEK",
    limit: number = 10
  ): Promise<LeaderboardEntry[]> {
    const url = new URL(ENDPOINTS.leaderboard);
    url.searchParams.set("category", category);
    url.searchParams.set("timePeriod", timePeriod);
    url.searchParams.set("orderBy", "PNL");
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Leaderboard fetch failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("Unexpected leaderboard response format");
    }

    return data
      .filter((t: LeaderboardEntry) => t.pnl > 0)
      .map((t: LeaderboardEntry) => ({
        rank: t.rank,
        proxyWallet: t.proxyWallet,
        userName: t.userName || `Trader ${t.rank}`,
        pnl: t.pnl,
        vol: t.vol,
        profileImage: t.profileImage,
        xUsername: t.xUsername,
        verifiedBadge: t.verifiedBadge,
      }));
  }

  /**
   * Fetch positions for a specific trader
   */
  async fetchPositions(
    wallet: string,
    sizeThreshold: number = 100,
    limit: number = 50
  ): Promise<Position[]> {
    const url = new URL(ENDPOINTS.positions);
    url.searchParams.set("user", wallet);
    url.searchParams.set("sizeThreshold", String(sizeThreshold));
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("sortBy", "CURRENT");
    url.searchParams.set("sortDirection", "DESC");

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Positions fetch failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .filter(
        (p: Position) =>
          !p.redeemable && p.size > sizeThreshold && p.title && p.outcome
      )
      .map((p: Position) => ({
        conditionId: p.conditionId,
        title: p.title,
        outcome: p.outcome,
        eventSlug: p.eventSlug || p.slug,
        size: p.size,
        avgPrice: p.avgPrice,
        curPrice: p.curPrice,
        cashPnl: p.cashPnl,
        percentPnl: p.percentPnl,
        redeemable: p.redeemable,
        endDate: p.endDate,
      }));
  }

  /**
   * Fetch active markets
   */
  async fetchMarkets(
    limit: number = 10,
    active: boolean = true,
    minVolume: number = 0
  ): Promise<Market[]> {
    const url = new URL(ENDPOINTS.markets);
    url.searchParams.set("limit", String(limit * 2)); // Fetch extra for filtering
    if (active) {
      url.searchParams.set("active", "true");
      url.searchParams.set("closed", "false");
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Markets fetch failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("Unexpected markets response format");
    }

    return data
      .filter((m: Market) => {
        if (minVolume > 0 && (m.volume24hr || 0) < minVolume) return false;
        if (active && m.resolved) return false;
        return true;
      })
      .slice(0, limit)
      .map((m: Market) => ({
        conditionId: m.conditionId,
        question: m.question,
        outcomes: m.outcomes,
        volume24hr: m.volume24hr || 0,
        liquidity: m.liquidity || 0,
        resolved: m.resolved,
        endDate: m.endDate,
      }));
  }

  /**
   * Main skill: Analyze copy-trading opportunities
   */
  async analyzeCopyTrades(
    numTraders: number = 10,
    timePeriod: string = "WEEK",
    minConviction: number = 2,
    copyFraction: number = 0.1
  ): Promise<CopyTradeAnalysis> {
    // Step 1: Fetch top traders
    const topTraders = await this.fetchLeaderboard(
      "OVERALL",
      timePeriod,
      numTraders
    );

    if (topTraders.length === 0) {
      throw new Error("No traders found on leaderboard");
    }

    // Step 2: Fetch positions for each trader (in parallel)
    const traderPositions = await Promise.all(
      topTraders.map(async (trader) => {
        try {
          const positions = await this.fetchPositions(
            trader.proxyWallet,
            100,
            50
          );
          return { trader, positions };
        } catch (e) {
          console.error(
            `Failed to fetch positions for ${trader.userName}:`,
            e
          );
          return { trader, positions: [] };
        }
      })
    );

    // Step 3: Aggregate positions by market+outcome (conviction scoring)
    const positionMap = new Map<
      string,
      {
        conditionId: string;
        title: string;
        outcome: string;
        eventSlug: string;
        curPrice: number;
        endDate?: string;
        traders: {
          userName: string;
          proxyWallet: string;
          rank: number;
          size: number;
          avgPrice: number;
          cashPnl: number;
        }[];
        totalSize: number;
        totalPnl: number;
      }
    >();

    for (const { trader, positions } of traderPositions) {
      for (const pos of positions) {
        const key = `${pos.conditionId}|${pos.outcome}`;

        if (!positionMap.has(key)) {
          positionMap.set(key, {
            conditionId: pos.conditionId,
            title: pos.title,
            outcome: pos.outcome,
            eventSlug: pos.eventSlug || "",
            curPrice: pos.curPrice,
            endDate: pos.endDate,
            traders: [],
            totalSize: 0,
            totalPnl: 0,
          });
        }

        const agg = positionMap.get(key)!;
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
    const recommendations: CopyTradeRecommendation[] = aggregatedPositions
      .slice(0, 10)
      .map((pos) => {
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

    // Return full analysis
    return {
      topTraders: topTraders.map((t) => {
        const td = traderPositions.find(
          (tp) => tp.trader.proxyWallet === t.proxyWallet
        );
        return { ...t, positionCount: td?.positions?.length || 0 };
      }),
      recommendations,
      meta: {
        analyzedAt: new Date().toISOString(),
        timePeriod,
        tradersAnalyzed: topTraders.length,
        positionsScanned: traderPositions.reduce(
          (sum, tp) => sum + tp.positions.length,
          0
        ),
        minConviction,
        positionsWithConviction: aggregatedPositions.length,
      },
    };
  }
}
