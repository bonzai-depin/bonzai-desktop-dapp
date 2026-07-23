import { ethers } from 'ethers'
import { CONFIG } from '../config/web3.config.js'
import { web3Service } from './web3.service.js'

const ROUTER_ABI = [
  'function registerRoute(bytes32 assetId,string metadataURI,address[] wallets,uint16[] baseBps,uint16[] contributionScores,string[] roles)',
  'function depositRevenue(bytes32 assetId) payable',
  'function claim(bytes32 assetId)',
  'function claimable(bytes32 assetId,address recipient) view returns (uint256)',
  'function getRoute(bytes32 assetId) view returns (address publisher,string metadataURI,bool active,uint256 createdAt,uint256 totalReceived,tuple(address wallet,uint16 baseBps,uint16 contributionScore,string role)[] recipients)',
]

function config() {
  return CONFIG.stakingEconomy || CONFIG.contributionEconomy || {}
}

function isConfigured() {
  return Boolean(config().revenueRouterAddress)
}

function networkKeyForChain(chainId) {
  return Object.entries(CONFIG.networks || {})
    .find(([, network]) => Number(network.chainId) === Number(chainId))?.[0] || 'ethereum'
}

async function routerContract(withSigner = false) {
  if (!config().revenueRouterAddress) {
    throw new Error('BONZAI revenue router is not configured yet.')
  }
  const networkKey = networkKeyForChain(config().chainId)
  if (withSigner) {
    await web3Service.switchNetwork?.(networkKey)
    const provider = await web3Service.getBrowserProvider()
    const signer = await provider.getSigner()
    return new ethers.Contract(config().revenueRouterAddress, ROUTER_ABI, signer)
  }
  const provider = await web3Service.getProvider(networkKey)
  return new ethers.Contract(config().revenueRouterAddress, ROUTER_ABI, provider)
}

function assetIdFor(value) {
  if (/^0x[a-fA-F0-9]{64}$/.test(String(value || ''))) return value
  return ethers.id(String(value || `bonzai-asset-${Date.now()}`))
}

function normalizeRouteParticipants(participants = [], fallbackWallet = web3Service.state?.walletAddress) {
  const valid = participants
    .map(participant => ({
      wallet: participant.wallet || participant.address || participant.owner || '',
      role: participant.role || 'contributor',
      score: Math.max(0, Math.min(10000, Math.round(Number(participant.qualityScore || participant.score || 7000)))),
      bps: Math.max(0, Math.round(Number(participant.shareBps || participant.bps || participant.weightBps || 0))),
    }))
    .filter(participant => ethers.isAddress(participant.wallet))

  if (!valid.length && ethers.isAddress(fallbackWallet || '')) {
    valid.push({ wallet: fallbackWallet, role: 'publisher', score: 7000, bps: 10000 })
  }

  const total = valid.reduce((sum, participant) => sum + participant.bps, 0)
  if (total <= 0 && valid.length) {
    const base = Math.floor(10000 / valid.length)
    valid.forEach((participant, index) => {
      participant.bps = index === valid.length - 1 ? 10000 - base * (valid.length - 1) : base
    })
    return valid
  }

  let allocated = 0
  valid.forEach((participant, index) => {
    participant.bps = index === valid.length - 1
      ? 10000 - allocated
      : Math.floor((participant.bps / total) * 10000)
    allocated += participant.bps
  })

  return valid
}

async function registerRoute({ assetId, metadataURI, participants, fallbackWallet } = {}) {
  if (!isConfigured()) throw new Error('BONZAI revenue router is not configured yet.')
  const routeParticipants = normalizeRouteParticipants(participants, fallbackWallet)
  if (!routeParticipants.length) throw new Error('No valid contributor wallets for revenue route.')

  const contract = await routerContract(true)
  const tx = await contract.registerRoute(
    assetIdFor(assetId),
    metadataURI || `bonzai-asset://${assetId || Date.now()}`,
    routeParticipants.map(participant => participant.wallet),
    routeParticipants.map(participant => participant.bps),
    routeParticipants.map(participant => participant.score),
    routeParticipants.map(participant => participant.role),
  )
  const receipt = await tx.wait()
  return {
    success: true,
    txHash: receipt.hash,
    assetId: assetIdFor(assetId),
    participants: routeParticipants,
  }
}

async function registerModelRevenueRoute(model, provenance = {}, assetIdOverride = null) {
  const revenuePlan = provenance?.attribution?.revenuePlan || {}
  return registerRoute({
    assetId: assetIdOverride || model?.fineTuneToken?.poolId || model?.modelRegistry?.modelId || model?.id,
    metadataURI: model?.modelRegistry?.metadataURI || model?.nft?.metadataUrl || model?.nft?.contentUrl || `bonzai-model://${model?.id || Date.now()}`,
    participants: revenuePlan.participants || [],
    fallbackWallet: web3Service.state?.walletAddress,
  })
}

async function getRoute(assetId) {
  const contract = await routerContract(false)
  const raw = await contract.getRoute(assetIdFor(assetId))
  return {
    publisher: raw.publisher,
    metadataURI: raw.metadataURI,
    active: raw.active,
    createdAt: Number(raw.createdAt),
    totalReceived: Number(ethers.formatEther(raw.totalReceived)),
    recipients: raw.recipients.map(item => ({
      wallet: item.wallet,
      baseBps: Number(item.baseBps),
      contributionScore: Number(item.contributionScore),
      role: item.role,
    })),
  }
}

async function claimable(assetId, wallet = web3Service.state?.walletAddress) {
  if (!wallet) return 0
  const contract = await routerContract(false)
  return Number(ethers.formatEther(await contract.claimable(assetIdFor(assetId), wallet)))
}

async function depositRevenue(assetId, amountEth) {
  const contract = await routerContract(true)
  const tx = await contract.depositRevenue(assetIdFor(assetId), { value: ethers.parseEther(String(amountEth || '0')) })
  const receipt = await tx.wait()
  return { success: true, txHash: receipt.hash }
}

async function claim(assetId) {
  const contract = await routerContract(true)
  const tx = await contract.claim(assetIdFor(assetId))
  const receipt = await tx.wait()
  return { success: true, txHash: receipt.hash }
}

export const bonzaiRevenueRouterService = {
  isConfigured,
  registerRoute,
  registerModelRevenueRoute,
  getRoute,
  claimable,
  depositRevenue,
  claim,
}

export default bonzaiRevenueRouterService
