/**
 * DefiLlama Dimension Adapter template (Fees/Revenue)
 *
 * Tracks LVL∞ purchases by reading InfinityPurchased logs on Ethereum.
 *
 * How this maps to DefiLlama:
 * - dailyFees: sum(amountWei) of InfinityPurchased
 * - dailyRevenue: same (100% of payments are forwarded to treasury; protocol revenue == fees)
 *
 * You will need to:
 * - Set REGISTRY to the deployed BonzAIInfinityRegistry address
 * - Set start timestamp once deployed
 *
 * Docs:
 * - https://docs.llama.fi/list-your-project/other-dashboards
 * - https://docs.llama.fi/list-your-project/other-dashboards/how-to-build-an-adapter
 */

import { getLogs } from "../helper/cache/getLogs";

const REGISTRY = "0xYOUR_DEPLOYED_REGISTRY_ADDRESS";

const eventAbi =
  "event InfinityPurchased(address indexed buyer, uint256 amountWei, address indexed treasury, uint256 timestamp)";

const adapter: any = {
  version: 2,
  adapter: {
    ethereum: {
      start: 0, // TODO: set to deployment timestamp
      fetch: async (timestamp: number, _t?: any, options?: any) => {
        const logs = await getLogs({
          target: REGISTRY,
          eventAbi,
          fromBlock: options.fromBlock,
          toBlock: options.toBlock,
          chain: "ethereum",
        });

        let dailyFees = 0n;
        for (const l of logs) {
          const amount = BigInt(l.amountWei ?? l.args?.amountWei ?? "0");
          dailyFees += amount;
        }

        const dailyRevenue = dailyFees;

        return {
          timestamp,
          dailyFees: dailyFees.toString(),
          dailyRevenue: dailyRevenue.toString(),
          dailyHoldersRevenue: "0",
          dailySupplySideRevenue: "0",
        };
      },
    },
  },
};

export default adapter;
