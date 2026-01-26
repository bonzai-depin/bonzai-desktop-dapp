#!/usr/bin/env node
/**
 * BonzAI Skills MCP Server
 *
 * Model Context Protocol server that exposes BonzAI skills to Claude Code CLI.
 * Enables prediction market analysis, copy-trading recommendations, and more
 * directly from the Claude Code terminal.
 *
 * Usage in Claude Code:
 * 1. Add to ~/.claude/claude.json:
 *    {
 *      "mcpServers": {
 *        "bonzai-skills": {
 *          "command": "npx",
 *          "args": ["bonzai-skills-mcp"],
 *          "env": {
 *            "BONZAI_REGISTRY_ADDRESS": "0x...",
 *            "BONZAI_RPC_URL": "https://arb1.arbitrum.io/rpc"
 *          }
 *        }
 *      }
 *    }
 *
 * 2. Use skills in Claude Code:
 *    "Use the polymarket skill to find copy-trading opportunities"
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { PolymarketAPI } from "./polymarket.js";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const REGISTRY_ADDRESS = process.env.BONZAI_REGISTRY_ADDRESS;
const RPC_URL = process.env.BONZAI_RPC_URL || "https://arb1.arbitrum.io/rpc";

// ═══════════════════════════════════════════════════════════════════════════
// POLYMARKET SKILL TOOLS
// ═══════════════════════════════════════════════════════════════════════════

const POLYMARKET_TOOLS: Tool[] = [
  {
    name: "polymarket_fetch_leaderboard",
    description:
      "Fetch top performing traders from Polymarket leaderboard ranked by PnL. " +
      "Returns trader names, wallets, profit/loss, and volume.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["OVERALL", "POLITICS", "SPORTS", "CRYPTO", "POP_CULTURE"],
          default: "OVERALL",
          description: "Market category to filter leaderboard",
        },
        timePeriod: {
          type: "string",
          enum: ["DAY", "WEEK", "MONTH", "ALL"],
          default: "WEEK",
          description: "Time period for PnL calculation",
        },
        limit: {
          type: "number",
          default: 10,
          minimum: 1,
          maximum: 100,
          description: "Number of traders to return",
        },
      },
      required: [],
    },
  },
  {
    name: "polymarket_fetch_positions",
    description:
      "Get all active positions for a specific Polymarket trader wallet. " +
      "Returns market questions, outcomes, position sizes, and PnL.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: {
          type: "string",
          description: "Trader proxy wallet address",
        },
        sizeThreshold: {
          type: "number",
          default: 100,
          description: "Minimum position size in USD to include",
        },
        limit: {
          type: "number",
          default: 50,
          description: "Maximum positions to return",
        },
      },
      required: ["wallet"],
    },
  },
  {
    name: "polymarket_fetch_markets",
    description:
      "Get active prediction markets from Polymarket. " +
      "Returns market questions, current prices, volume, and end dates.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          default: 10,
          minimum: 1,
          maximum: 50,
          description: "Number of markets to return",
        },
        active: {
          type: "boolean",
          default: true,
          description: "Only return active (not resolved) markets",
        },
        minVolume: {
          type: "number",
          default: 0,
          description: "Minimum 24h volume in USD",
        },
      },
      required: [],
    },
  },
  {
    name: "polymarket_analyze_copy_trades",
    description:
      "Analyze top PnL traders and find positions where multiple winners agree. " +
      "Returns copy-trading recommendations with conviction scores and suggested position sizes. " +
      "This is the main skill for getting whale intelligence on Polymarket.",
    inputSchema: {
      type: "object",
      properties: {
        numTraders: {
          type: "number",
          default: 10,
          minimum: 1,
          maximum: 20,
          description: "Number of top traders to analyze",
        },
        timePeriod: {
          type: "string",
          enum: ["DAY", "WEEK", "MONTH", "ALL"],
          default: "WEEK",
          description: "Time period for trader ranking",
        },
        minConviction: {
          type: "number",
          default: 2,
          minimum: 1,
          maximum: 10,
          description: "Minimum number of traders that must agree on a position",
        },
        copyFraction: {
          type: "number",
          default: 0.1,
          minimum: 0.01,
          maximum: 1,
          description: "Fraction of whale position to copy (0.1 = 10%)",
        },
      },
      required: [],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MCP SERVER
// ═══════════════════════════════════════════════════════════════════════════

class BonzaiSkillsServer {
  private server: Server;
  private polymarket: PolymarketAPI;

  constructor() {
    this.server = new Server(
      {
        name: "bonzai-skills-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.polymarket = new PolymarketAPI();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: POLYMARKET_TOOLS,
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result: unknown;

        switch (name) {
          case "polymarket_fetch_leaderboard":
            result = await this.polymarket.fetchLeaderboard(
              (args?.category as string) || "OVERALL",
              (args?.timePeriod as string) || "WEEK",
              (args?.limit as number) || 10
            );
            break;

          case "polymarket_fetch_positions":
            if (!args?.wallet) {
              throw new Error("wallet parameter is required");
            }
            result = await this.polymarket.fetchPositions(
              args.wallet as string,
              (args?.sizeThreshold as number) || 100,
              (args?.limit as number) || 50
            );
            break;

          case "polymarket_fetch_markets":
            result = await this.polymarket.fetchMarkets(
              (args?.limit as number) || 10,
              (args?.active as boolean) ?? true,
              (args?.minVolume as number) || 0
            );
            break;

          case "polymarket_analyze_copy_trades":
            result = await this.polymarket.analyzeCopyTrades(
              (args?.numTraders as number) || 10,
              (args?.timePeriod as string) || "WEEK",
              (args?.minConviction as number) || 2,
              (args?.copyFraction as number) || 0.1
            );
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        const content: TextContent = {
          type: "text",
          text: JSON.stringify(result, null, 2),
        };

        return { content: [content] };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        const content: TextContent = {
          type: "text",
          text: JSON.stringify({ error: errorMessage }, null, 2),
        };

        return { content: [content], isError: true };
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("BonzAI Skills MCP server running on stdio");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

const server = new BonzaiSkillsServer();
server.run().catch(console.error);
