import companionTokenService from './companionToken.service.js'
import fineTuneTokenService from './fineTuneToken.service.js'
import { getAllGameTokenAddresses, getGameTokenInfo } from './gameToken.service.js'
import { CONFIG } from '../config/web3.config.js'
import { withTimeout } from '../utils/withTimeout.js'
import { isMarketAddress, selectMarketPair, marketHistoryKey, marketObservations } from './marketData.js'

const chainId = CONFIG.stakingEconomy.chainId
const HISTORY_KEY = marketHistoryKey(chainId)
const readHistory = () => { try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch { return {} } }

async function marketFor(address, timeout, signal) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  const timer = setTimeout(abort, timeout)
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`Market data unavailable (${response.status})`)
    return selectMarketPair(await response.json(), address, chainId)
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
}

async function mapLimited(items, task) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; results[index] = await task(items[index]) }
  }))
  return results
}

export async function loadMarketSnapshot({ signal } = {}) {
  const deadline = Date.now() + 24000
  const read = request => withTimeout(request, Math.max(1, Math.min(6000, deadline - Date.now())), 'Market read timed out')
  const definitions = [
    { id: 'companion', label: 'Smart agents', config: CONFIG.companionTokenFactory, list: () => companionTokenService.getAllTokenAddresses({ strict: true }), info: address => companionTokenService.getTokenInfo(address) },
    { id: 'fine_tuned', label: 'Models', config: CONFIG.fineTuneTokenFactory, list: () => fineTuneTokenService.getAllTokenAddresses({ strict: true }), info: async address => {
      const info = await fineTuneTokenService.getTokenInfo(address)
      if (!info) return null
      try { const profile = await read(fineTuneTokenService.getTokenProfile(address)); return { ...info, ...profile, kind: profile?.modelKind === 'abliterated' ? 'abliterated' : 'fine_tuned' } }
      catch { return { ...info, profileUnavailable: true } }
    } },
    { id: 'game', label: 'Games', config: CONFIG.gameTokenFactory, list: getAllGameTokenAddresses, info: getGameTokenInfo },
  ]
  const sources = await Promise.all(definitions.map(async source => {
    const base = { id: source.id, label: source.label, address: source.config?.contractAddress, addresses: [] }
    if (!isMarketAddress(base.address) || Number(source.config.chainId) !== Number(chainId)) return { ...base, status: 'unconfigured' }
    try {
      const addresses = await read(source.list())
      if (!Array.isArray(addresses)) throw new Error('Invalid listing response')
      return { ...base, status: 'ready', addresses: [...new Set(addresses.filter(isMarketAddress).map(address => address.toLowerCase()))] }
    } catch { return { ...base, status: 'error' } }
  }))
  // A factory proves issuance even when an individual metadata read fails.
  const seen = new Set()
  const entries = sources.flatMap((source, index) => source.addresses.filter(address => {
    if (seen.has(address)) return false
    seen.add(address); return true
  }).map(address => ({ address, source: definitions[index] })))
  const assets = await mapLimited(entries, async ({ address, source }) => {
    let info
    try { if (signal?.aborted || Date.now() >= deadline) throw new Error('Cancelled'); info = await read(source.info(address)) } catch {}
    const asset = { kind: source.id, ...info, address, sourceId: source.id, metadataUnavailable: !info, name: info?.name || `${address.slice(0, 6)}…${address.slice(-4)}`, symbol: info?.symbol || 'TOKEN' }
    try {
      if (signal?.aborted || Date.now() >= deadline) throw new Error('Market read timed out')
      return { ...asset, market: await marketFor(address, Math.max(1, Math.min(6000, deadline - Date.now())), signal) }
    } catch { return { ...asset, market: null, marketError: 'Price feed unavailable' } }
  })
  const history = readHistory(), time = Math.floor(Date.now() / 1000)
  for (const asset of assets) history[asset.address] = marketObservations(history[asset.address], { time, value: asset.market?.priceUsd })
  if (!signal?.aborted) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)) } catch { /* Storage quota must not prevent market discovery. */ } }
  return { sources: sources.map(({ addresses, ...source }) => ({ ...source, count: addresses.length })),
    assets: assets.map(asset => ({ ...asset, history: history[asset.address] })), updatedAt: Date.now() }
}

export async function loadMarkets(options) { return (await loadMarketSnapshot(options)).assets }
