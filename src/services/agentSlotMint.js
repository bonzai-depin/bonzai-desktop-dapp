import { ethers } from 'ethers';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';
import { BonzaiSmartAgentsABI } from '../contracts/abi/BonzaiSmartAgents.abi.js';
import { confirmedReceipt } from './transactionReceipt.js';

export function slotSaleState({ start, end, now, supply, maxSupply, minted, limit, launcher }) {
  if (!ethers.isAddress(launcher || '') || launcher === ethers.ZeroAddress) return 'Token launcher is not configured.';
  if (!start || now < start) return 'The slot sale has not started.';
  if (now >= end) return 'The slot sale has ended.';
  if (BigInt(supply) >= BigInt(maxSupply)) return 'All slots have been minted.';
  if (BigInt(minted) >= BigInt(limit)) return 'This wallet has reached its slot mint limit.';
  return '';
}
export async function readSlotSale(wallet = web3Service.state.walletAddress) {
  const address = CONFIG.smartAgentIssuance?.contractAddress;
  if (!ethers.isAddress(address || '') || address === ethers.ZeroAddress) throw new Error('Agent slot minting is not configured on this network.');
  if (!ethers.isAddress(wallet || '')) throw new Error('Connect the wallet that will own the slot.');
  const provider = await web3Service.getProvider(ECONOMY_NETWORK_KEY);
  const contract = new ethers.Contract(address, BonzaiSmartAgentsABI, provider);
  const [price, reserve, start, end, supply, maxSupply, minted, limit, launcher, block] = await Promise.all([
    contract.MINT_PRICE(), contract.LP_RESERVE(), contract.mintStart(), contract.mintEnd(), contract.totalSupply(), contract.MAX_SUPPLY(), contract.mintedBy(wallet), contract.MAX_PER_WALLET(), contract.launcher(), provider.getBlock('latest'),
  ]);
  const reason = slotSaleState({ start: Number(start), end: Number(end), now: block.timestamp, supply, maxSupply, minted, limit, launcher });
  return { address, wallet, price: price.toString(), priceDisplay: ethers.formatEther(price), reserve: reserve.toString(), reserveDisplay: ethers.formatEther(reserve), reason, start: Number(start), end: Number(end), remaining: (limit - minted).toString() };
}
export async function mintAgentSlot(reviewed) {
  await web3Service.switchNetwork(ECONOMY_NETWORK_KEY);
  const signer = await (await web3Service.getBrowserProvider()).getSigner();
  const wallet = await signer.getAddress();
  if (wallet.toLowerCase() !== reviewed.wallet.toLowerCase()) throw new Error('Wallet changed. Review the slot purchase again.');
  const current = await readSlotSale(wallet);
  if (current.reason) throw new Error(current.reason);
  if (['address', 'price', 'reserve', 'start', 'end'].some(key => String(current[key]) !== String(reviewed[key]))) throw new Error('Slot sale terms changed. Review them again.');
  const activeSigner = await (await web3Service.getBrowserProvider()).getSigner();
  if ((await activeSigner.getAddress()).toLowerCase() !== wallet.toLowerCase()) throw new Error('Wallet changed. Review the slot purchase again.');
  const contract = new ethers.Contract(current.address, BonzaiSmartAgentsABI, activeSigner);
  const receipt = await confirmedReceipt(await contract.mintSlots(1, { value: BigInt(current.price) }));
  return { transactionHash: receipt.hash };
}
