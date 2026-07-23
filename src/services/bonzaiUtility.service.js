import { ethers } from 'ethers'
import { CONFIG } from '../config/web3.config.js'
import { web3Service } from './web3.service.js'
import { activeLevels, highestActiveLevel, canMintContentType, allUnlockedViaEth } from './level.service.js'
import { bonzaiStakingService } from './bonzaiStaking.service.js'

const LEVEL_MULTIPLIERS = {
  LVL1: 1.05,
  LVL2: 1.12,
  LVL3: 1.2,
  LVL4: 1.32,
  LVL5: 1.45,
  LVL6: 1.6,
}

const ROLE_WEIGHTS = {
  data_owner: 1.0,
  curator: 0.7,
  evaluator: 0.75,
  voter: 0.35,
  trainer: 1.0,
  provider: 0.85,
  publisher: 0.65,
  companion: 0.8,
  company: 0.9,
  creator: 1.0,
}

function safeString(value, max = 1000) {
  if (value === undefined || value === null) return ''
  return String(value).trim().slice(0, max)
}

function hashContent(parts = []) {
  return ethers.keccak256(ethers.toUtf8Bytes(parts.map(part => safeString(part, 4000)).join('|') || 'bonzai-empty'))
}

function normalizeRole(role) {
  const key = safeString(role || 'creator').toLowerCase().replace(/[^a-z0-9]+/g, '_')
  return ROLE_WEIGHTS[key] ? key : 'creator'
}

function activeLevelNumber(levelKey) {
  const match = String(levelKey || '').match(/LVL(\d+)/)
  return match ? Number(match[1]) : 0
}

export function getBonzaiLevelSnapshot(assetType = null) {
  const active = activeLevels.value || []
  const highest = highestActiveLevel.value
  const requiredLevel = assetType ? CONFIG.mintLevels?.[assetType] || null : null
  const mintGate = assetType ? canMintContentType(assetType) : null
  const balance = Number(web3Service.state?.balances?.total || 0)
  const levelMultiplier = highest ? LEVEL_MULTIPLIERS[highest] || 1 : 1

  return {
    wallet: web3Service.state?.walletAddress || null,
    balance,
    activeLevels: active,
    highestActiveLevel: highest,
    highestActiveLevelNumber: activeLevelNumber(highest),
    levelMultiplier,
    requiredLevel,
    canMint: mintGate?.canMint ?? null,
    mintBlockReason: mintGate?.reason || null,
    allLevelsUnlocked: Boolean(allUnlockedViaEth.value),
    capturedAt: new Date().toISOString(),
  }
}

export function getBonzaiStakingSnapshot() {
  const position = bonzaiStakingService.state.position
  return {
    wallet: web3Service.state?.walletAddress || null,
    configured: bonzaiStakingService.isConfigured.value,
    amount: position?.amount || 0,
    utilityWeight: position?.weight || 0,
    utilityTier: position?.tier || 0,
    utilityTierLabel: position?.tierLabel || 'No stake',
    contributionScore: position?.contributionScore || 0,
    lockMultiplierBps: position?.lockMultiplierBps || 10000,
    contributionMultiplierBps: position?.contributionMultiplierBps || 10000,
    lockedUntil: position?.lockedUntil || 0,
    capturedAt: new Date().toISOString(),
  }
}

export function buildContributionManifest({
  id,
  assetType = 'generation',
  role = 'creator',
  prompt = '',
  output = '',
  source = 'BonzAI Desktop',
  parents = [],
  qualityScore = 70,
  metadata = {},
} = {}) {
  const normalizedRole = normalizeRole(role)
  const contentHash = hashContent([assetType, prompt, output, id])
  const score = Math.max(0, Math.min(100, Math.round(Number(qualityScore) || 0)))
  const wallet = web3Service.state?.walletAddress || null
  return {
    schema: 'bonzai-contribution-manifest',
    version: 1,
    id: id || `local-${Date.now()}`,
    assetType,
    role: normalizedRole,
    roleWeight: ROLE_WEIGHTS[normalizedRole],
    creator: {
      wallet,
      identity: wallet ? 'wallet' : 'local',
    },
    contentHash,
    source,
    parents: Array.isArray(parents) ? parents.filter(Boolean) : [],
    qualityScore: score,
    visibility: 'private',
    permissions: {
      trainingAllowed: true,
      commercialAllowed: false,
      publishable: false,
      royaltyBearing: false,
    },
    royaltyRoute: wallet
      ? [{
        wallet,
        role: normalizedRole === 'creator' ? 'creator_data_owner' : normalizedRole,
        weight: ROLE_WEIGHTS[normalizedRole],
        contributionId: id || null,
        contributionHash: contentHash,
      }]
      : [],
    metadata,
    createdAt: new Date().toISOString(),
  }
}

export function buildBonzaiUtilitySnapshot({
  assetType,
  role = 'creator',
  contribution = null,
  parents = [],
  action = 'create',
} = {}) {
  const level = getBonzaiLevelSnapshot(assetType)
  const staking = getBonzaiStakingSnapshot()
  const normalizedRole = normalizeRole(role)
  const roleWeight = ROLE_WEIGHTS[normalizedRole]
  const qualityScore = Number(contribution?.qualityScore || 70)
  const contributorScore = roleWeight * (qualityScore / 100)
  const stakeMultiplier = staking.utilityWeight > 0 && staking.amount > 0
    ? staking.utilityWeight / staking.amount
    : 1
  const levelAdjustedScore = contributorScore * level.levelMultiplier
  const stakingAdjustedScore = contributorScore * stakeMultiplier

  return {
    schema: 'bonzai-utility-snapshot',
    version: 2,
    action,
    assetType,
    contributionId: contribution?.id || null,
    contributionHash: contribution?.contentHash || null,
    contributionRole: normalizedRole,
    contributionParents: Array.isArray(parents) ? parents.filter(Boolean) : [],
    contributorScore,
    levelAdjustedScore,
    stakingAdjustedScore,
    level,
    staking,
    demandMechanism: 'proof-of-contribution-plus-staked-bonzai-utility-weight',
    createdAt: new Date().toISOString(),
  }
}

export const bonzaiUtilityService = {
  getBonzaiLevelSnapshot,
  getBonzaiStakingSnapshot,
  buildContributionManifest,
  buildBonzaiUtilitySnapshot,
}

export default bonzaiUtilityService
