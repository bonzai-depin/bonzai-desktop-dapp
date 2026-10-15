import { ethers } from 'ethers';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { BonzaiBasketRewardsABI } from '../contracts/abi/BonzaiBasketRewards.abi.js';
import { web3Service } from './web3.service.js';
import { assertClaimableRow, readRewardBasket } from './rewardBasket.js';

const TOKEN_ABI = ['function symbol() view returns(string)', 'function decimals() view returns(uint8)'];
export const basketRewardsConfigured = () => Boolean(CONFIG.basketRewards?.contractAddress);

async function getContract(write = false) {
  if (!basketRewardsConfigured()) throw new Error('Basket rewards are not configured on this network.');
  if (write) {
    await web3Service.switchNetwork(ECONOMY_NETWORK_KEY);
    const provider = await web3Service.getBrowserProvider();
    return new ethers.Contract(CONFIG.basketRewards.contractAddress, BonzaiBasketRewardsABI, await provider.getSigner());
  }
  return new ethers.Contract(CONFIG.basketRewards.contractAddress, BonzaiBasketRewardsABI, await web3Service.getProvider(ECONOMY_NETWORK_KEY));
}

export async function fetchRewardBasket(wallet, options) {
  if (!ethers.isAddress(wallet || '')) throw new Error('Connect to view rewards.');
  const provider = await web3Service.getProvider(ECONOMY_NETWORK_KEY);
  return readRewardBasket(await getContract(), wallet, async currency => {
    if (currency === ethers.ZeroAddress) return { symbol: CONFIG.networks[ECONOMY_NETWORK_KEY].currency?.symbol || 'ETH', decimals: 18 };
    const token = new ethers.Contract(currency, TOKEN_ABI, provider);
    const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
    const precision = Number(decimals);
    if (!Number.isInteger(precision) || precision < 0 || precision > 36) throw new Error('Unsupported token precision.');
    return { symbol: String(symbol).slice(0, 32), decimals: precision };
  }, options);
}

export async function claimBasketCurrency(row, expectedWallet) {
  assertClaimableRow(row);
  const contract = await getContract(true);
  const signerAddress = await contract.runner.getAddress();
  if (signerAddress.toLowerCase() !== String(expectedWallet).toLowerCase()) throw new Error('Wallet changed. Refresh rewards before claiming.');
  const transaction = await contract.claim(row.address, row.claimEpochs, signerAddress);
  const receipt = await transaction.wait();
  return { txHash: receipt.hash };
}
