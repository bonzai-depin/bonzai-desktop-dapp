import { computed, reactive } from 'vue'
import { ethers } from 'ethers'
import { CONFIG } from '../config/web3.config.js'
import { web3Service } from './web3.service.js'

const ERC20_ABI = [
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
]

const STAKING_ABI = [
  'function stake(uint256 amount,uint256 lockDuration)',
  'function unstake(uint256 amount)',
  'function extendLock(uint256 lockDuration)',
  'function positionOf(address wallet) view returns (uint256 amount,uint256 lockedUntil,uint32 contributionScore,uint16 lockMultiplier,uint16 contributionMultiplier,uint8 tier,uint256 weight)',
  'function utilityTier(address wallet) view returns (uint8)',
  'function utilityWeight(address wallet) view returns (uint256)',
  'function totalStaked() view returns (uint256)',
]

const state = reactive({
  isLoading: false,
  isStaking: false,
  error: '',
  position: null,
  totalStaked: 0,
  lastFetch: null,
})

function config() {
  return CONFIG.stakingEconomy || {}
}

function isConfigured() {
  return Boolean(config().stakingVaultAddress && config().tokenAddress)
}

function networkKeyForChain(chainId) {
  return Object.entries(CONFIG.networks || {})
    .find(([, network]) => Number(network.chainId) === Number(chainId))?.[0] || 'ethereum'
}

async function stakingContract(withSigner = false) {
  if (!config().stakingVaultAddress) {
    throw new Error('BONZAI staking vault is not configured yet.')
  }
  const networkKey = networkKeyForChain(config().chainId)
  if (withSigner) {
    await web3Service.switchNetwork?.(networkKey)
    const provider = await web3Service.getBrowserProvider()
    const signer = await provider.getSigner()
    return new ethers.Contract(config().stakingVaultAddress, STAKING_ABI, signer)
  }
  const provider = await web3Service.getProvider(networkKey)
  return new ethers.Contract(config().stakingVaultAddress, STAKING_ABI, provider)
}

async function tokenContract(withSigner = false) {
  if (!config().tokenAddress) {
    throw new Error('BONZAI token is not configured.')
  }
  const networkKey = networkKeyForChain(config().chainId)
  if (withSigner) {
    await web3Service.switchNetwork?.(networkKey)
    const provider = await web3Service.getBrowserProvider()
    const signer = await provider.getSigner()
    return new ethers.Contract(config().tokenAddress, ERC20_ABI, signer)
  }
  const provider = await web3Service.getProvider(networkKey)
  return new ethers.Contract(config().tokenAddress, ERC20_ABI, provider)
}

function formatPosition(raw) {
  if (!raw) return null
  const amount = Number(ethers.formatEther(raw.amount || 0n))
  const weight = Number(ethers.formatEther(raw.weight || 0n))
  const lockedUntil = Number(raw.lockedUntil || 0)
  const tier = Number(raw.tier || 0)
  const tierConfig = (config().utilityTiers || []).find(item => Number(item.tier) === tier)
  return {
    amount,
    lockedUntil,
    contributionScore: Number(raw.contributionScore || 0),
    lockMultiplierBps: Number(raw.lockMultiplier || 10000),
    contributionMultiplierBps: Number(raw.contributionMultiplier || 10000),
    tier,
    tierLabel: tierConfig?.label || (tier ? `Tier ${tier}` : 'No stake'),
    weight,
  }
}

async function fetchPosition(wallet = web3Service.state?.walletAddress) {
  state.isLoading = true
  state.error = ''
  try {
    if (!wallet || !isConfigured()) {
      state.position = null
      return null
    }
    const contract = await stakingContract(false)
    const [raw, total] = await Promise.all([
      contract.positionOf(wallet),
      contract.totalStaked(),
    ])
    state.position = formatPosition(raw)
    state.totalStaked = Number(ethers.formatEther(total))
    state.lastFetch = Date.now()
    return state.position
  } catch (err) {
    state.error = err.message || 'Failed to fetch BONZAI stake.'
    return null
  } finally {
    state.isLoading = false
  }
}

async function approveIfNeeded(wallet, amountWei) {
  const token = await tokenContract(true)
  const allowance = await token.allowance(wallet, config().stakingVaultAddress)
  if (allowance >= amountWei) return null
  const tx = await token.approve(config().stakingVaultAddress, amountWei)
  return tx.wait()
}

async function stake(amount, lockSeconds = 0) {
  state.isStaking = true
  state.error = ''
  try {
    if (!isConfigured()) throw new Error('BONZAI staking is not configured yet.')
    const wallet = web3Service.state?.walletAddress
    if (!wallet) throw new Error('Connect a wallet before staking BONZAI.')
    const amountWei = ethers.parseEther(String(amount || '0'))
    if (amountWei <= 0n) throw new Error('Enter a BONZAI amount to stake.')
    await approveIfNeeded(wallet, amountWei)
    const contract = await stakingContract(true)
    const tx = await contract.stake(amountWei, Number(lockSeconds || 0))
    const receipt = await tx.wait()
    await fetchPosition(wallet)
    return { success: true, txHash: receipt.hash }
  } catch (err) {
    state.error = err.message || 'BONZAI staking failed.'
    return { success: false, error: state.error }
  } finally {
    state.isStaking = false
  }
}

async function unstake(amount) {
  state.isStaking = true
  state.error = ''
  try {
    if (!isConfigured()) throw new Error('BONZAI staking is not configured yet.')
    const wallet = web3Service.state?.walletAddress
    if (!wallet) throw new Error('Connect a wallet before unstaking BONZAI.')
    const amountWei = ethers.parseEther(String(amount || '0'))
    if (amountWei <= 0n) throw new Error('Enter a BONZAI amount to unstake.')
    const contract = await stakingContract(true)
    const tx = await contract.unstake(amountWei)
    const receipt = await tx.wait()
    await fetchPosition(wallet)
    return { success: true, txHash: receipt.hash }
  } catch (err) {
    state.error = err.message || 'BONZAI unstaking failed.'
    return { success: false, error: state.error }
  } finally {
    state.isStaking = false
  }
}

async function extendLock(lockSeconds) {
  state.isStaking = true
  state.error = ''
  try {
    if (!isConfigured()) throw new Error('BONZAI staking is not configured yet.')
    const wallet = web3Service.state?.walletAddress
    if (!wallet) throw new Error('Connect a wallet before extending a lock.')
    const contract = await stakingContract(true)
    const tx = await contract.extendLock(Number(lockSeconds || 0))
    const receipt = await tx.wait()
    await fetchPosition(wallet)
    return { success: true, txHash: receipt.hash }
  } catch (err) {
    state.error = err.message || 'Lock extension failed.'
    return { success: false, error: state.error }
  } finally {
    state.isStaking = false
  }
}

export const bonzaiStakingService = {
  state,
  isConfigured: computed(isConfigured),
  tiers: computed(() => config().utilityTiers || []),
  lockOptions: computed(() => config().lockOptions || []),
  fetchPosition,
  stake,
  unstake,
  extendLock,
}

export default bonzaiStakingService
