const marketChainIds = Object.freeze({ 1: 'ethereum', 42161: 'arbitrum', 8453: 'base', 4663: 'robinhood' });

/** Prices describe the pair's base token, on the requested chain only. */
export function selectMarketPair(payload, tokenAddress, chainId) {
  const chain = marketChainIds[Number(chainId)];
  if (!chain || !/^0x[a-fA-F0-9]{40}$/.test(tokenAddress || '')) return null;
  const address = tokenAddress.toLowerCase();
  const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
  return pairs.filter(pair => pair?.chainId === chain && pair?.baseToken?.address?.toLowerCase() === address)
    .sort((left, right) => Number(right.liquidity?.usd || 0) - Number(left.liquidity?.usd || 0))[0] || null;
}

// Previous history was keyed by address alone and could mix chains.
export const marketHistoryKey = chainId => `bonzai.market.history.v2.${Number(chainId)}`;

export const marketWatchlistKey = chainId => `bonzai.market.watchlist.v1.${Number(chainId)}`;
export const isMarketAddress = value => /^0x[a-fA-F0-9]{40}$/.test(value || '') && !/^0x0{40}$/i.test(value);
export const marketNumber = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) ? Number(value) : null;

/** Keep real observations, including flat prices, with one point per second. */
export function marketObservations(points, observation, limit = 720) {
  const byTime = new Map();
  for (const point of [...(Array.isArray(points) ? points : []), ...(observation ? [observation] : [])]) {
    const time = marketNumber(point?.time), value = marketNumber(point?.value);
    if (time !== null && time > 0 && value !== null && value > 0) byTime.set(Math.floor(time), { time: Math.floor(time), value });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time).slice(-limit);
}

export function filterMarketAssets(assets, { kind = 'all', query = '', watchlist = null, sort = 'liquidity' } = {}) {
  const search = query.trim().toLowerCase();
  const metric = asset => marketNumber(sort === 'change' ? asset.market?.priceChange?.h24 : sort === 'volume' ? asset.market?.volume?.h24 : asset.market?.liquidity?.usd);
  return assets.filter(asset => (kind === 'all' || asset.kind === kind)
    && (!watchlist || watchlist.includes(asset.address.toLowerCase()))
    && (!search || [asset.name, asset.symbol, asset.address].some(value => String(value || '').toLowerCase().includes(search))))
    .sort((a, b) => {
      if (sort === 'name') return String(a.name).localeCompare(String(b.name));
      const left = metric(a), right = metric(b);
      return (left === null ? right === null ? 0 : 1 : right === null ? -1 : right - left) || String(a.name).localeCompare(String(b.name));
    });
}

/** Never present missing pool figures as zero or sum multiple pools for one token. */
export function marketTotals(assets) {
  const sum = getter => {
    const values = assets.map(getter).map(marketNumber).filter(value => value !== null && value >= 0);
    return { value: values.length ? values.reduce((total, value) => total + value, 0) : null, count: values.length };
  };
  return { priced: assets.filter(asset => marketNumber(asset.market?.priceUsd) > 0).length,
    volume: sum(asset => asset.market?.volume?.h24), liquidity: sum(asset => asset.market?.liquidity?.usd) };
}

// Uniswap's public interface confirms the route, quote and slippage before signing.
// https://developers.uniswap.org/docs/trading/custom-interface-links
export function marketTradeUrl(address, chainId, side = 'buy') {
  const chain = marketChainIds[Number(chainId)];
  if (!chain || !isMarketAddress(address) || !['buy', 'sell'].includes(side)) return null;
  const params = new URLSearchParams({ chain: chain === 'ethereum' ? 'mainnet' : chain,
    inputCurrency: side === 'sell' ? address : 'ETH', outputCurrency: side === 'sell' ? 'ETH' : address });
  return `https://app.uniswap.org/swap?${params}`;
}

export function marketAnalyticsUrl(pair, address, chainId) {
  if (!pair || !selectMarketPair({ pairs: [pair] }, address, chainId)) return null;
  // Construct from validated identifiers, never trust a URL returned by token metadata.
  if (!/^0x[a-fA-F0-9]{40}(?:[a-fA-F0-9]{24})?$/.test(pair.pairAddress || '')) return null;
  return `https://dexscreener.com/${marketChainIds[Number(chainId)]}/${pair.pairAddress}`;
}
