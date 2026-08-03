# BonzAI Skills MCP Server

An MCP server exposing BonzAI prediction-market tools to compatible Model Context Protocol clients.

## Tools

- `polymarket_fetch_leaderboard`: fetch ranked Polymarket traders.
- `polymarket_fetch_positions`: inspect active positions for a wallet.
- `polymarket_fetch_markets`: list active markets and market data.
- `polymarket_analyze_copy_trades`: find positions shared by multiple high-performing traders.

## Run

```bash
npm install
npm run build
npm start
```

Or install and launch the published package:

```bash
npm install -g bonzai-skills-mcp
bonzai-skills-mcp
```

Configure an MCP client to start `npx bonzai-skills-mcp`. The optional environment variables `BONZAI_REGISTRY_ADDRESS` and `BONZAI_RPC_URL` enable the registry integration implemented by this package.

## License

MIT
