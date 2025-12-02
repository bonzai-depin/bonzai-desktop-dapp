/**
 * BonzAI — Token Gating Service
 * Tier Requirements: 99 BONZAI (generate), 999 BONZAI (mint), 9999 BONZAI (smart agents)
 */

import { reactive, readonly, computed } from 'vue';
import { ethers } from 'ethers';

const BONZAI_TOKEN_ADDRESS = '0x0a84edf70f30325151631ce7a61307d1f4d619a3';
const ARBITRUM_CHAIN_ID = 42161;
const DEFAULT_TIERS = { generation: 99, minting: 999, smartAgent: 9999 };
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];

const state = reactive({
  walletAddress: null, bonzaiBalance: 0, isConnected: false, chainId: null,
  tiers: { ...DEFAULT_TIERS }, isChecking: false, lastCheck: null, error: null,
});

let provider = null, tokenContract = null;

const initProvider = async () => {
  if (!window.ethereum) throw new Error('No Web3 provider detected');
  provider = new ethers.BrowserProvider(window.ethereum);
  window.ethereum.on('accountsChanged', async (accounts) => {
    if (accounts.length === 0) { state.walletAddress = null; state.bonzaiBalance = 0; state.isConnected = false; }
    else { state.walletAddress = accounts[0]; state.isConnected = true; await checkBalance(); }
  });
  window.ethereum.on('chainChanged', (chainIdHex) => { state.chainId = parseInt(chainIdHex, 16); if (state.isConnected) checkBalance(); });
  return provider;
};

export const connectWallet = async () => {
  state.error = null;
  if (!provider) await initProvider();
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (accounts.length === 0) throw new Error('No accounts found');
  state.walletAddress = accounts[0]; state.isConnected = true;
  state.chainId = Number((await provider.getNetwork()).chainId);
  await checkBalance();
  return { address: state.walletAddress, balance: state.bonzaiBalance, chainId: state.chainId };
};

export const checkBalance = async () => {
  if (!state.walletAddress) throw new Error('Wallet not connected');
  state.isChecking = true; state.error = null;
  try {
    if (!tokenContract) tokenContract = new ethers.Contract(BONZAI_TOKEN_ADDRESS, ERC20_ABI, provider);
    const decimals = await tokenContract.decimals();
    state.bonzaiBalance = parseFloat(ethers.formatUnits(await tokenContract.balanceOf(state.walletAddress), decimals));
    state.lastCheck = Date.now();
    return state.bonzaiBalance;
  } catch (e) { state.error = e.message; return 0; }
  finally { state.isChecking = false; }
};

export const canGenerate = computed(() => state.bonzaiBalance >= state.tiers.generation);
export const canMint = computed(() => state.bonzaiBalance >= state.tiers.minting);
export const canUseSmartAgents = computed(() => state.bonzaiBalance >= state.tiers.smartAgent);
export const currentTier = computed(() => {
  if (state.bonzaiBalance >= state.tiers.smartAgent) return 'smartAgent';
  if (state.bonzaiBalance >= state.tiers.minting) return 'minting';
  if (state.bonzaiBalance >= state.tiers.generation) return 'generation';
  return 'none';
});

export const verifyAccess = async (action = 'generate') => {
  if (!state.lastCheck || Date.now() - state.lastCheck > 300000) if (state.isConnected) await checkBalance();
  if (!state.isConnected) return { allowed: false, reason: 'Wallet not connected', action: 'connect' };
  if (state.chainId !== ARBITRUM_CHAIN_ID) return { allowed: false, reason: 'Switch to Arbitrum', action: 'switchNetwork' };
  const tierMap = { generate: 'generation', mint: 'minting', smartAgent: 'smartAgent' };
  const required = state.tiers[tierMap[action] || action];
  if (state.bonzaiBalance < required) return {
    allowed: false, reason: `Need ${required} BONZAI to ${action}`,
    needed: required - state.bonzaiBalance, required, current: state.bonzaiBalance,
    buyUrl: 'https://app.uniswap.org/swap?chain=arbitrum&outputCurrency=0x0a84edf70f30325151631ce7a61307d1f4d619a3',
  };
  return { allowed: true, tier: currentTier.value, balance: state.bonzaiBalance };
};

export const switchToArbitrum = async () => {
  try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xa4b1' }] }); return true; }
  catch (e) {
    if (e.code === 4902) {
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: '0xa4b1', chainName: 'Arbitrum One',
        nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://arb1.arbitrum.io/rpc'], blockExplorerUrls: ['https://arbiscan.io/'],
      }] }); return true;
    } throw e;
  }
};

export const disconnectWallet = () => { state.walletAddress = null; state.bonzaiBalance = 0; state.isConnected = false; state.chainId = null; };
export const updateTiers = (newTiers) => { state.tiers = { ...state.tiers, ...newTiers }; };

export const tokenGating = {
  state: readonly(state), connectWallet, disconnectWallet, switchToArbitrum, checkBalance,
  verifyAccess, canGenerate, canMint, canUseSmartAgents, currentTier, updateTiers,
  BONZAI_TOKEN_ADDRESS, ARBITRUM_CHAIN_ID, DEFAULT_TIERS,
};
export default tokenGating;
