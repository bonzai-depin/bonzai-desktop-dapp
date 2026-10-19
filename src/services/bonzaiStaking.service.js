import { confirmedReceipt } from './transactionReceipt.js';
import { computed, reactive } from 'vue'
import { ethers } from 'ethers'
import { CONFIG, networkKeyForChainId } from '../config/web3.config.js'
import { web3Service } from './web3.service.js'

const ERC20_ABI = [
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
]

const STAKING_ABI = [
  'function stake(uint256 amount,uint256 lockDuration)',
  'function stakeForRewards(uint256 amount)',
  'function activateRewards()',
  'function requestRewardExit()',
  'function rewardActive(address) view returns(bool)',
  'function rewardExitAt(address) view returns(uint256)',
  'function REWARD_EXIT_DELAY() view returns(uint256)',
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
  rewardActive: false,
  rewardExitAt: 0,
  rewardExitDelay: 90 * 86400,
})
let positionRequest = 0

function config() {
  return CONFIG.stakingEconomy || {}
}

function isConfigured() {
  return Boolean(config().stakingVaultAddress && config().tokenAddress)
}

function networkKeyForChain(chainId) {
  const network = networkKeyForChainId(chainId);
  if (!network) throw new Error(`Unsupported staking chain: ${chainId}`);
  return network;
}

async function stakingContract(withSigner = false, expectedWallet) {
  if (!config().stakingVaultAddress) {
    throw new Error('BONZAI staking vault is not configured yet.')
  }
  const networkKey = networkKeyForChain(config().chainId)
  if (withSigner) {
    await web3Service.switchNetwork?.(networkKey)
    const provider = await web3Service.getBrowserProvider()
    const signer = await provider.getSigner()
    await assertWallet(signer, expectedWallet)
    return new ethers.Contract(config().stakingVaultAddress, STAKING_ABI, signer)
  }
  const provider = await web3Service.getProvider(networkKey)
  return new ethers.Contract(config().stakingVaultAddress, STAKING_ABI, provider)
}

async function tokenContract(withSigner = false, expectedWallet) {
  if (!config().tokenAddress) {
    throw new Error('BONZAI token is not configured.')
  }
  const networkKey = networkKeyForChain(config().chainId)
  if (withSigner) {
    await web3Service.switchNetwork?.(networkKey)
    const provider = await web3Service.getBrowserProvider()
    const signer = await provider.getSigner()
    await assertWallet(signer, expectedWallet)
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
    amountExact: ethers.formatEther(raw.amount || 0n),
    lockedUntil,
    contributionScore: Number(raw.contributionScore || 0),
    lockMultiplierBps: Number(raw.lockMultiplier || 10000),
    contributionMultiplierBps: Number(raw.contributionMultiplier || 10000),
    tier,
    tierLabel: tierConfig?.label || (tier ? `Tier ${tier}` : 'No stake'),
    weight,
  }
}

async function assertWallet(signer, expectedWallet) {
  if (!expectedWallet || (await signer.getAddress()).toLowerCase() !== expectedWallet.toLowerCase()) {
    throw new Error('Wallet changed. Review your stake again.')
  }
}

async function fetchPosition(wallet = web3Service.state?.walletAddress) {
  const request = ++positionRequest
  state.isLoading = true
  state.error = ''
  try {
    if (!wallet || !isConfigured()) {
      state.position = null
      state.rewardActive = false
      state.rewardExitAt = 0
      return null
    }
    const contract = await stakingContract(false)
    const [raw, total, reward] = await Promise.all([
      contract.positionOf(wallet),
      contract.totalStaked(),
      config().basketRewardsAddress
        ? Promise.all([contract.rewardActive(wallet), contract.rewardExitAt(wallet), contract.REWARD_EXIT_DELAY()])
        : Promise.resolve([false, 0, 90 * 86400]),
    ])
    if (request !== positionRequest) return null
    state.position = formatPosition(raw)
    state.rewardActive = reward[0]
    state.rewardExitAt = Number(reward[1])
    state.rewardExitDelay = Number(reward[2])
    state.totalStaked = Number(ethers.formatEther(total))
    state.lastFetch = Date.now()
    return state.position
  } catch (err) {
    if (request !== positionRequest) return null
    state.position = null
    state.rewardActive = false
    state.rewardExitAt = 0
    state.error = err.message || 'Failed to fetch BONZAI stake.'
    return null
  } finally {
    if (request === positionRequest) state.isLoading = false
  }
}

async function rewardStakeAction(method, amount) {
  state.isStaking = true
  state.error = ''
  try {
    if (!config().basketRewardsAddress) throw new Error('Basket rewards are not configured yet.')
    const wallet = web3Service.state?.walletAddress
    if (!wallet) throw new Error('Connect before staking BONZAI.')
    const args = []
    if (method === 'stakeForRewards') {
      const units = ethers.parseEther(String(amount || '0'))
      if (units <= 0n) throw new Error('Enter a positive BONZAI amount.')
      await approveIfNeeded(wallet, units)
      args.push(units)
    }
    const contract = await stakingContract(true, wallet)
    const tx = await contract[method](...args)
    const receipt = await confirmedReceipt(tx)
    await fetchPosition(wallet)
    return { success: true, txHash: receipt.hash }
  } catch (err) {
    state.error = err.shortMessage || err.message
    return { success: false, error: state.error, transactionHash: err.transactionHash, confirmationPending: err.confirmationPending }
  } finally { state.isStaking = false }
}

async function approveIfNeeded(wallet, amountWei) {
  const token = await tokenContract(true, wallet)
  const allowance = await token.allowance(wallet, config().stakingVaultAddress)
  if (allowance >= amountWei) return null
  const tx = await token.approve(config().stakingVaultAddress, amountWei)
  return confirmedReceipt(tx)
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
    const contract = await stakingContract(true, wallet)
    const tx = await contract.stake(amountWei, Number(lockSeconds || 0))
    const receipt = await confirmedReceipt(tx)
    await fetchPosition(wallet)
    return { success: true, txHash: receipt.hash }
  } catch (err) {
    state.error = err.message || 'BONZAI staking failed.'
    return { success: false, error: state.error, transactionHash: err.transactionHash, confirmationPending: err.confirmationPending }
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
    const contract = await stakingContract(true, wallet)
    const tx = await contract.unstake(amountWei)
    const receipt = await confirmedReceipt(tx)
    await fetchPosition(wallet)
    return { success: true, txHash: receipt.hash }
  } catch (err) {
    state.error = err.message || 'BONZAI unstaking failed.'
    return { success: false, error: state.error, transactionHash: err.transactionHash, confirmationPending: err.confirmationPending }
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
    const contract = await stakingContract(true, wallet)
    const tx = await contract.extendLock(Number(lockSeconds || 0))
    const receipt = await confirmedReceipt(tx)
    await fetchPosition(wallet)
    return { success: true, txHash: receipt.hash }
  } catch (err) {
    state.error = err.message || 'Lock extension failed.'
    return { success: false, error: state.error, transactionHash: err.transactionHash, confirmationPending: err.confirmationPending }
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
  stakeForRewards: amount => rewardStakeAction('stakeForRewards', amount),
  activateRewards: () => rewardStakeAction('activateRewards'),
  requestRewardExit: () => rewardStakeAction('requestRewardExit'),
}

export default bonzaiStakingService
