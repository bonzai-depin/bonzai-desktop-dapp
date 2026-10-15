import assert from 'node:assert/strict'
import test from 'node:test'
import { marketObservations, filterMarketAssets, marketTotals, marketTradeUrl, marketAnalyticsUrl, marketWatchlistKey, marketNumber } from '../src/services/marketData.js'
const address = digit => `0x${digit.repeat(40)}`

test('observed prices retain flat periods, reject corrupt cache entries and deduplicate seconds', () => {
  assert.deepEqual(marketObservations([{ time: 2, value: 1 }, { time: 1, value: 1 }, { time: 2, value: 3 }, { time: 3, value: -1 }, null, { time: 4, value: 'NaN' }], { time: 5, value: '3' }), [{ time: 1, value: 1 }, { time: 2, value: 3 }, { time: 5, value: 3 }])
  assert.deepEqual(marketObservations('corrupt', { time: 8, value: null }), [])
  assert.deepEqual(marketObservations([{ time: 1, value: 1 }, { time: 2, value: 1 }], { time: 3, value: 2 }, 2), [{ time: 2, value: 1 }, { time: 3, value: 2 }])
})
test('market discovery keeps missing data below real zero and negative figures', () => {
  const assets = [{ address: address('1'), name: 'Ada', symbol: 'ADA', kind: 'companion', market: { priceUsd: '0.001', liquidity: { usd: 5 }, volume: { h24: 0 }, priceChange: { h24: -5 } } }, { address: address('2'), name: 'World', symbol: 'WLD', kind: 'game', market: null }]
  assert.equal(filterMarketAssets(assets, { sort: 'change' })[0].symbol, 'ADA')
  assert.equal(filterMarketAssets(assets, { query: 'ada', kind: 'companion' }).length, 1)
  assert.equal(filterMarketAssets(assets, { query: address('2').toUpperCase() })[0].symbol, 'WLD')
  assert.equal(filterMarketAssets(assets, { watchlist: [] }).length, 0)
  assert.equal(filterMarketAssets(assets, { watchlist: [address('2')] })[0].symbol, 'WLD')
  assert.deepEqual(marketTotals(assets), { priced: 1, volume: { value: 0, count: 1 }, liquidity: { value: 5, count: 1 } })
  assert.equal(marketTotals([]).liquidity.value, null)
  for (const invalid of [null, undefined, '', ' ', true, [], 'NaN', Infinity]) assert.equal(marketNumber(invalid), null)
  assert.notEqual(marketWatchlistKey(4663), marketWatchlistKey(8453))
})
test('trading shortcuts preserve asset, network and buy/sell direction without inventing a quote', () => {
  const buy = new URL(marketTradeUrl(address('1'), 4663, 'buy')), sell = new URL(marketTradeUrl(address('1'), 8453, 'sell'))
  assert.equal(buy.searchParams.get('chain'), 'robinhood')
  assert.equal(buy.searchParams.get('outputCurrency'), address('1'))
  assert.equal(sell.searchParams.get('inputCurrency'), address('1'))
  assert.equal(sell.searchParams.get('outputCurrency'), 'ETH')
  assert.equal(sell.searchParams.get('chain'), 'base')
  assert.equal(marketTradeUrl(address('1'), 46630), null)
  assert.equal(marketTradeUrl('https://invalid.test', 4663), null)
  assert.equal(marketTradeUrl(address('0'), 4663), null)
  assert.equal(marketTradeUrl(address('1'), 4663, 'bad'), null)
})
test('analytics links use only a validated same-chain base-token pool', () => {
  const pair = { chainId: 'robinhood', baseToken: { address: address('1') }, pairAddress: `0x${'2'.repeat(64)}`, url: 'https://untrusted.test' }
  assert.equal(marketAnalyticsUrl(pair, address('1'), 4663), `https://dexscreener.com/robinhood/${pair.pairAddress}`)
  assert.equal(marketAnalyticsUrl(pair, address('1'), 8453), null)
  assert.equal(marketAnalyticsUrl(pair, address('2'), 4663), null)
  assert.equal(marketAnalyticsUrl({ ...pair, pairAddress: 'javascript:alert(1)' }, address('1'), 4663), null)
})
