/*
 * Polymarket Copy‑Trading Agent
 *
 * This agent connects to the public Polymarket data endpoints to identify
 * high‑interest markets and the most influential traders within each.
 * It then surfaces the traders’ current positions and suggests copy
 * trades with a smaller position size. The goal is to help users
 * discover and mirror whale activity in a transparent way without
 * blindly matching their full exposure.
 *
 * NOTE: This file is designed to be consumed by the BonzAI agent
 * runtime. It exports a definition with a descriptive name,
 * configurable inputs and a single async execute() method. The
 * execute() method uses the native fetch API – available in modern
 * browsers and in environments such as Deno – to pull data from
 * Polymarket’s Gamma and Data API endpoints. If you run this in
 * Node.js you may need to enable experimental fetch or polyfill it.
 */

export default {
  /**
   * A human readable name for the agent. This appears in the UI.
   */
  name: 'Polymarket Copy Trader',

  /**
   * A short description explaining what the agent does. Keep this
   * concise; users will see it when browsing the marketplace.
   */
  description: 'Identify the hottest markets and whales on Polymarket and mirror their positions with a smaller stake.',

  /**
   * The category under which this agent should appear. This helps
   * organise the marketplace. Use `analysis` for agents focused on
   * data, modelling and decision support.
   */
  category: 'analysis',

  /**
   * Input fields allow users to customise the agent’s behaviour.
   * Each entry defines a name, type, default value and a friendly
   * label. The runtime automatically renders these as controls.
   */
  inputs: {
    /**
     * How many top markets should the agent analyse? A small number
     * keeps requests fast and results digestible. Defaults to 3.
     */
    numMarkets: {
      type: 'number',
      default: 3,
      label: 'Number of markets to follow'
    },
    /**
     * Fraction of the whale’s position to replicate. Use a decimal
     * between 0 and 1. For example, 0.1 means take 10% of the top
     * holder’s exposure. Defaults to 0.1 (10%).
     */
    copyFraction: {
      type: 'number',
      default: 0.1,
      label: 'Fraction of whale position to copy'
    }
  },

  /**
   * Main execution entry point. The BonzAI runtime passes the
   * resolved inputs and a context object when invoking this method.
   *
   * @param {Object} inputs - User provided input values merged with defaults.
   * @param {Object} context - Execution context (not used here).
   * @returns {Promise<Object>} Results including recommended trades.
   */
  async execute (inputs, context) {
    const results = [];

    // Pull configurable values and validate them. Sanity checks
    // prevent misuse and give helpful errors early.
    const numMarkets = Math.max(1, Math.min(10, Math.floor(inputs.numMarkets || 3)));
    let copyFraction = parseFloat(inputs.copyFraction);
    if (Number.isNaN(copyFraction) || copyFraction <= 0 || copyFraction > 1) {
      copyFraction = 0.1;
    }

    /**
     * Helper to fetch JSON from a URL and gracefully handle HTTP
     * errors. We throw a descriptive error on non‑OK status codes
     * so that the agent runtime can surface problems to the user.
     *
     * @param {string} url
     * @returns {Promise<any>}
     */
    const fetchJson = async (url) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status} ${res.statusText} for ${url}`);
      }
      return res.json();
    };

    /**
     * Determine the hottest markets by descending 24h volume. We call
     * the Gamma markets endpoint with sorting parameters. If the
     * sorting parameters are not supported by the backend the API
     * returns unsorted data; in that case we manually sort by
     * volume24hr on the client side.
     */
    const marketsUrl = `https://gamma-api.polymarket.com/markets?limit=${numMarkets}&sort=volume24hr%3Adesc`;
    let markets = await fetchJson(marketsUrl);
    if (!Array.isArray(markets)) {
      throw new Error('Unexpected response from markets endpoint');
    }
    // Some older versions of the Gamma API ignore the sort parameter. Sort
    // defensively to guarantee descending order.
    markets = markets
      .filter(m => m.volume24hr !== undefined)
      .sort((a, b) => (b.volume24hr || 0) - (a.volume24hr || 0))
      .slice(0, numMarkets);

    for (const market of markets) {
      const { question, conditionId, outcomes } = market;

      // Fetch top holders for this market. The Data API expects a
      // comma‑separated list of condition IDs. We pass a single id
      // here. Limit holders to 5 per outcome to avoid large payloads.
      const holdersUrl = `https://data-api.polymarket.com/holders?market=${conditionId}&limit=5`;
      const holderData = await fetchJson(holdersUrl);
      if (!Array.isArray(holderData)) {
        throw new Error('Unexpected response from holders endpoint');
      }

      // Flatten the two outcome objects into a single list of
      // {outcomeIndex, holder} pairs. OutcomeIndex indicates which
      // side the trader is holding (0 for the first listed outcome, 1
      // for the second, etc.).
      const traders = [];
      for (const token of holderData) {
        const outcomeIndex = token.holders?.[0]?.outcomeIndex;
        if (!Array.isArray(token.holders)) continue;
        for (const h of token.holders) {
          traders.push({ outcomeIndex: h.outcomeIndex, amount: h.amount, name: h.name || h.pseudonym || h.proxyWallet });
        }
      }
      // Sort traders by descending position size and take the top
      traders.sort((a, b) => b.amount - a.amount);

      // Build recommended trades based on the top trader for each
      // outcome. We ensure we don’t duplicate recommendations when a
      // single trader holds both tokens.
      const recommended = [];
      const seenOutcomes = new Set();
      for (const trader of traders) {
        if (seenOutcomes.has(trader.outcomeIndex)) continue;
        seenOutcomes.add(trader.outcomeIndex);
        // Determine the market outcome label. Outcomes on Polymarket
        // are stored as a JSON string; parse if necessary.
        let outcomeLabels;
        try {
          outcomeLabels = JSON.parse(market.outcomes || outcomes || '[]');
        } catch (_) {
          outcomeLabels = outcomes || [];
        }
        const outcomeLabel = outcomeLabels[trader.outcomeIndex] || `Outcome ${trader.outcomeIndex}`;
        const positionSize = (trader.amount * copyFraction).toFixed(2);
        recommended.push({
          trader: trader.name,
          outcome: outcomeLabel,
          originalSize: trader.amount,
          suggestedSize: parseFloat(positionSize)
        });
      }

      results.push({ question, conditionId, recommendations: recommended });
    }

    // Return a structured object. The BonzAI runtime will
    // serialise this and render it in the UI. You can return
    // arbitrary nested JSON here.
    return { markets: results };
  }
};