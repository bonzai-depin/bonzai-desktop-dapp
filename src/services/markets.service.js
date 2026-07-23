import companionTokenService from './companionToken.service.js'
import fineTuneTokenService from './fineTuneToken.service.js'

const HISTORY_KEY = 'bonzai.market.history.v1'
const readHistory = () => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}') } catch { return {} } }
const writeHistory = value => localStorage.setItem(HISTORY_KEY, JSON.stringify(value))

async function marketFor(address) {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`)
  if (!response.ok) throw new Error(`Market data unavailable (${response.status})`)
  const payload = await response.json()
  const pairs = (payload.pairs || []).filter(pair => pair.dexId === 'uniswap')
  return pairs.sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))[0] || null
}

function record(assets) {
  const history = readHistory(); const now = Math.floor(Date.now() / 1000)
  for (const asset of assets) {
    if (!asset.market?.priceUsd) continue
    const points = [...(history[asset.address] || []), { time: now, value: Number(asset.market.priceUsd) }]
    history[asset.address] = points.filter((point, index) => index === 0 || point.value !== points[index - 1].value).slice(-720)
  }
  writeHistory(history); return history
}

export async function loadMarkets() {
  const [companionAddresses, modelAddresses] = await Promise.all([
    companionTokenService.getAllTokenAddresses(), fineTuneTokenService.getAllTokenAddresses(),
  ])
  const companions = (await Promise.all(companionAddresses.map(companionTokenService.getTokenInfo))).filter(Boolean).map(info => ({ ...info, kind: 'companion' }))
  const models = (await Promise.all(modelAddresses.map(async address => {
    const info = await fineTuneTokenService.getTokenInfo(address); if (!info) return null
    const profile = await fineTuneTokenService.getModelProfile(info.contentTokenId)
    return { ...info, ...profile, imageURI: profile?.imageURI, kind: profile?.modelKind || 'fine_tuned' }
  }))).filter(Boolean)
  const assets = await Promise.all([...companions, ...models].map(async asset => {
    try { return { ...asset, market: await marketFor(asset.address) } } catch (error) { return { ...asset, market: null, marketError: error.message } }
  }))
  const history = record(assets)
  return assets.map(asset => ({ ...asset, history: history[asset.address] || [] }))
}
