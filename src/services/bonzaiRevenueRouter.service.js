import { ethers } from 'ethers'
import { CONFIG, networkKeyForChainId } from '../config/web3.config.js'
import { web3Service } from './web3.service.js'
import { BonzaiRevenueRouterABI } from '../contracts/abi/BonzaiRevenueRouter.abi.js'

const ROUTER_ABI = [
  'function registerRoute(bytes32 assetId,string metadataURI,address[] wallets,uint16[] baseBps,uint16[] contributionScores,string[] roles) returns (bytes32)',
  'function routeIdFor(address publisher,bytes32 sourceAssetId) pure returns (bytes32)',
  'function depositRevenue(bytes32 assetId) payable',
  'function claim(bytes32 assetId)',
  'function claimable(bytes32 assetId,address recipient) view returns (uint256)',
  'function getRoute(bytes32 assetId) view returns (address publisher,string metadataURI,bool active,uint256 createdAt,uint256 totalReceived,tuple(address wallet,uint16 baseBps,uint16 contributionScore,string role)[] recipients)',
]

const MODEL_TOKEN_ABI = [
  'function creator() view returns (address)',
]
const HOOK_ABI = [
  'function getPoolConfig(bytes32 poolId) view returns (address beneficiary,address companionOwner,uint8 poolType,uint8 mintPoolIndex,bool active)',
]
const CURRENCY_ABI = ['function decimals() view returns(uint8)', 'function symbol() view returns(string)']

function config() {
  return CONFIG.stakingEconomy || CONFIG.contributionEconomy || {}
}

function isConfigured() {
  return Boolean(config().revenueRouterAddress)
}

function networkKeyForChain(chainId) {
  const network = networkKeyForChainId(chainId)
  if (!network) throw new Error(`Unsupported revenue chain: ${chainId}`)
  return network
}

async function routerContract(withSigner = false, abi = ROUTER_ABI) {
  if (!config().revenueRouterAddress) {
    throw new Error('BONZAI revenue router is not configured yet.')
  }
  const networkKey = networkKeyForChain(config().chainId)
  if (withSigner) {
    await web3Service.switchNetwork?.(networkKey)
    const provider = await web3Service.getBrowserProvider()
    const signer = await provider.getSigner()
    return new ethers.Contract(config().revenueRouterAddress, abi, signer)
  }
  const provider = await web3Service.getProvider(networkKey)
  return new ethers.Contract(config().revenueRouterAddress, abi, provider)
}

function assetIdFor(value) {
  if (/^0x[a-fA-F0-9]{64}$/.test(String(value || ''))) return value
  return ethers.id(String(value || `bonzai-asset-${Date.now()}`))
}

export function normalizeRouteParticipants(participants = [], fallbackWallet = web3Service.state?.walletAddress) {
  if (!Array.isArray(participants) || participants.length > 64) throw new Error('Revenue route requires an array of at most 64 participants.')
  const validWallet = wallet => ethers.isAddress(wallet) && wallet.toLowerCase() !== ethers.ZeroAddress
  if (!participants.length) {
    if (!validWallet(fallbackWallet)) throw new Error('A valid nonzero publisher wallet is required for a revenue route.')
    return [{ wallet: ethers.getAddress(fallbackWallet), role: 'publisher', score: 7000, bps: 10000 }]
  }
  const basisPoints = (value, label) => {
    if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') throw new Error(`Invalid revenue ${label}.`)
    const number = Number(value)
    if (!Number.isInteger(number) || number < 0 || number > 10000) throw new Error(`Revenue ${label} must be an integer from 0 to 10000.`)
    return number
  }
  const seen = new Set()
  const valid = participants.map(participant => {
    if (!participant || typeof participant !== 'object') throw new Error('Invalid revenue route participant.')
    const wallet = participant.wallet ?? participant.address ?? participant.owner
    if (!validWallet(wallet)) throw new Error('Every revenue participant needs a valid nonzero wallet; correct the plan before publishing.')
    const key = wallet.toLowerCase()
    if (seen.has(key)) throw new Error('Duplicate revenue participant wallet; consolidate its shares before publishing.')
    seen.add(key)
    return {
      wallet: ethers.getAddress(wallet),
      role: participant.role || 'contributor',
      score: basisPoints(participant.qualityScore ?? participant.score ?? 7000, 'quality score'),
      bps: basisPoints(participant.shareBps ?? participant.bps ?? participant.weightBps, 'share'),
    }
  })
  const total = valid.reduce((sum, participant) => sum + participant.bps, 0)
  if (total === 0) throw new Error('Revenue participants must have a positive total share.')
  // Revenue plans may contain independently rounded proportions. Normalize only
  // valid shares, preserving zero shares and assigning rounding dust to a payee.
  const lastPositive = valid.findLastIndex(participant => participant.bps > 0)
  let allocated = 0
  valid.forEach((participant, index) => {
    participant.bps = index === lastPositive ? 10000 - allocated : Math.floor(participant.bps * 10000 / total)
    allocated += participant.bps
  })
  return valid
}

async function registerRoute({ assetId, metadataURI, participants, fallbackWallet, expectedPublisher } = {}) {
  if (!isConfigured()) throw new Error('BONZAI revenue router is not configured yet.')
  const routeParticipants = normalizeRouteParticipants(participants, fallbackWallet)
  if (!routeParticipants.length) throw new Error('No valid contributor wallets for revenue route.')

  const contract = await routerContract(true)
  const sourceAssetId = assetIdFor(assetId);
  const publisher = await contract.runner.getAddress();
  if (expectedPublisher && publisher.toLowerCase() !== expectedPublisher.toLowerCase()) {
    throw new Error('Only the original model token creator can register its fee route. NFT transfers do not change the token creator.');
  }
  const routeId = await contract.routeIdFor(publisher, sourceAssetId);
  const tx = await contract.registerRoute(
    sourceAssetId,
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
    assetId: routeId,
    sourceAssetId,
    participants: routeParticipants,
  }
}

async function registerModelRevenueRoute(model, provenance = {}, assetIdOverride = null) {
  const revenuePlan = provenance?.attribution?.revenuePlan || {}
  const tokenAddress = model?.fineTuneToken?.tokenAddress
  const poolId = assetIdOverride || model?.fineTuneToken?.poolId
  if (!ethers.isAddress(tokenAddress) || tokenAddress === ethers.ZeroAddress || !ethers.isHexString(poolId, 32) || poolId === ethers.ZeroHash) {
    throw new Error('Launch the model token before registering its pool revenue route.')
  }
  const network = networkKeyForChain(config().chainId)
  const hookAddress = CONFIG.uniswap?.[network]?.feeHook
  if (!ethers.isAddress(hookAddress) || hookAddress === ethers.ZeroAddress) throw new Error('Model fee hook is not configured.')
  const provider = await web3Service.getProvider(network)
  const token = new ethers.Contract(tokenAddress, MODEL_TOKEN_ABI, provider)
  const hook = new ethers.Contract(hookAddress, HOOK_ABI, provider)
  const [creator, pool] = await Promise.all([token.creator(), hook.getPoolConfig(poolId)])
  if (!pool.active || pool.poolType !== 1n || creator === ethers.ZeroAddress || pool.beneficiary.toLowerCase() !== creator.toLowerCase()) {
    throw new Error('The active model pool does not match the token creator.')
  }
  return registerRoute({
    assetId: poolId,
    metadataURI: model?.modelRegistry?.metadataURI || model?.nft?.metadataUrl || model?.nft?.contentUrl || `bonzai-model://${model?.id || Date.now()}`,
    participants: revenuePlan.participants || [],
    fallbackWallet: creator,
    expectedPublisher: creator,
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

function validateTokenRoyalty(assetId, currency, wallet) {
  if (!ethers.isHexString(assetId, 32) || assetId === ethers.ZeroHash) throw new Error('A verified contribution route is required.')
  if (!ethers.isAddress(currency) || currency === ethers.ZeroAddress) throw new Error('A valid social-token currency is required.')
  if (!ethers.isAddress(wallet) || wallet === ethers.ZeroAddress) throw new Error('Connect the contributor wallet to review royalties.')
}

/** Returns exact currency units. Never mixes token royalties with native revenue. */
export async function getTokenRoyaltyEntitlement(assetId, currency, wallet = web3Service.state?.walletAddress) {
  validateTokenRoyalty(assetId, currency, wallet)
  const contract = await routerContract(false, BonzaiRevenueRouterABI)
  const token = new ethers.Contract(currency, CURRENCY_ABI, contract.runner)
  const [rawAmount, rawDecimals, rawSymbol] = await Promise.all([
    contract.tokenClaimable(assetId, currency, wallet), token.decimals(), token.symbol(),
  ])
  const decimals = Number(rawDecimals)
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('Unsupported royalty-token precision.')
  return {
    assetId, currency: ethers.getAddress(currency), wallet: ethers.getAddress(wallet),
    rawAmount: rawAmount.toString(), amount: ethers.formatUnits(rawAmount, decimals), decimals,
    symbol: String(rawSymbol).slice(0, 32), chainId: Number(config().chainId),
  }
}

async function assertRoyaltyWallet(contract, expectedWallet) {
  const wallet = await contract.runner.getAddress()
  const chainId = Number(BigInt(await contract.runner.provider.send('eth_chainId', [])))
  if (wallet.toLowerCase() !== expectedWallet.toLowerCase()
    || web3Service.state?.walletAddress?.toLowerCase() !== expectedWallet.toLowerCase()) {
    throw new Error('Wallet changed. Review the contributor royalty claim again.')
  }
  if (chainId !== Number(config().chainId)) throw new Error('Network changed. Review the contributor royalty claim again.')
  return wallet
}

/** Claim only the reviewed wallet's entitlement, to that same wallet. */
export async function claimTokenRoyalties(assetId, currency, { expectedWallet = web3Service.state?.walletAddress } = {}) {
  validateTokenRoyalty(assetId, currency, expectedWallet)
  const contract = await routerContract(true, BonzaiRevenueRouterABI)
  await assertRoyaltyWallet(contract, expectedWallet)
  const amount = await contract.tokenClaimable(assetId, currency, expectedWallet)
  if (amount === 0n) throw new Error('No contributor royalties are available in this currency.')
  const recipient = await assertRoyaltyWallet(contract, expectedWallet)
  const transaction = await contract.claimToken(assetId, currency, recipient, { from: recipient, chainId: Number(config().chainId) })
  const receipt = await transaction.wait()
  return { success: true, txHash: receipt.hash, rawAmount: amount.toString(), currency, recipient }
}

export const bonzaiRevenueRouterService = {
  isConfigured,
  registerRoute,
  registerModelRevenueRoute,
  getRoute,
  claimable,
  depositRevenue,
  claim,
  getTokenRoyaltyEntitlement,
  claimTokenRoyalties,
}

export default bonzaiRevenueRouterService
