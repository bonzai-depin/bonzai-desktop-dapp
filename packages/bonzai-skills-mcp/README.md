# BonzAI Skills MCP Server

Model Context Protocol (MCP) server that brings BonzAI decentralized skills to Claude Code CLI.

## Features

- **Polymarket Analysis**: Fetch leaderboards, trader positions, and market data
- **Copy-Trading Intelligence**: Find high-conviction positions where multiple top traders agree
- **Whale Tracking**: Follow the smartest money on prediction markets

## Installation

```bash
npm install -g bonzai-skills-mcp
```

Or use directly with npx:

```bash
npx bonzai-skills-mcp
```

## Configuration

Add to your Claude Code configuration (`~/.claude/claude.json`):

```json
{
  "mcpServers": {
    "bonzai-skills": {
      "command": "npx",
      "args": ["bonzai-skills-mcp"],
      "env": {
        "BONZAI_REGISTRY_ADDRESS": "0x...",
        "BONZAI_RPC_URL": "https://arb1.arbitrum.io/rpc"
      }
    }
  }
}
```

## Available Tools

### `polymarket_fetch_leaderboard`

Fetch top performing traders from Polymarket leaderboard.

**Parameters:**
- `category` (string): Market category - "OVERALL", "POLITICS", "SPORTS", "CRYPTO", "POP_CULTURE"
- `timePeriod` (string): Time period - "DAY", "WEEK", "MONTH", "ALL"
- `limit` (number): Number of traders to return (1-100)

### `polymarket_fetch_positions`

Get all active positions for a specific trader wallet.

**Parameters:**
- `wallet` (string, required): Trader proxy wallet address
- `sizeThreshold` (number): Minimum position size in USD (default: 100)
- `limit` (number): Maximum positions to return (default: 50)

### `polymarket_fetch_markets`

Get active prediction markets from Polymarket.

**Parameters:**
- `limit` (number): Number of markets to return (1-50)
- `active` (boolean): Only return active markets (default: true)
- `minVolume` (number): Minimum 24h volume in USD

### `polymarket_analyze_copy_trades`

**The main skill** - Analyze top PnL traders and find positions where multiple winners agree.

**Parameters:**
- `numTraders` (number): Number of top traders to analyze (1-20, default: 10)
- `timePeriod` (string): Time period for ranking - "DAY", "WEEK", "MONTH", "ALL"
- `minConviction` (number): Minimum traders that must agree (1-10, default: 2)
- `copyFraction` (number): Fraction of whale position to copy (0.01-1, default: 0.1)

**Example Output:**
```json
{
  "topTraders": [
    {
      "rank": 1,
      "userName": "TopTrader123",
      "pnl": 125000,
      "vol": 500000,
      "positionCount": 15
    }
  ],
  "recommendations": [
    {
      "question": "Will Bitcoin reach $100k by December 2024?",
      "outcome": "Yes",
      "url": "https://polymarket.com/event/bitcoin-100k",
      "conviction": {
        "traderCount": 5,
        "totalSize": 50000,
        "avgPnl": 8500
      },
      "suggestedSize": 1000,
      "market": {
        "currentPrice": 0.65
      }
    }
  ],
  "meta": {
    "analyzedAt": "2024-01-15T10:30:00Z",
    "tradersAnalyzed": 10,
    "positionsScanned": 150,
    "positionsWithConviction": 8
  }
}
```

## Usage in Claude Code

Once configured, you can use natural language to invoke the skills:

```
> Use the polymarket skill to find copy-trading opportunities this week

> What are the top 5 traders on Polymarket doing right now?

> Find positions where at least 3 top traders agree
```

## On-Chain Integration

This MCP server can optionally connect to the BonzAI Skill Registry smart contract on Arbitrum to:
- Verify skill ownership
- Record executions
- Deduct running fees (in BONZAI tokens)

Set the `BONZAI_REGISTRY_ADDRESS` environment variable to enable on-chain features.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development
npm run dev
```

## License

MIT
