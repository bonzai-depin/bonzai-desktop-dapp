import { ethers } from 'ethers';

/** A reviewed launch belongs to one payer on one chain, even across wallet prompts. */
export async function assertLaunchWallet(web3, chainId, expectedWallet) {
  if (!ethers.isAddress(expectedWallet || '')) throw new Error('Connect a wallet before launching a smart agent.');
  const wallet = web3.getEip1193Provider();
  if (!wallet?.request) throw new Error('The connected signing wallet is unavailable.');
  const [accounts, liveChain] = await Promise.all([
    wallet.request({ method: 'eth_accounts' }), wallet.request({ method: 'eth_chainId' }),
  ]);
  if (Number(liveChain) !== Number(chainId)) throw new Error('The wallet network changed. Review the smart agent launch again.');
  if (String(accounts?.[0]).toLowerCase() !== expectedWallet.toLowerCase()) throw new Error('The connected wallet changed. Review the smart agent launch again.');
}

export function parseSmartAgentLaunchReceipt(receipt, contractAddress, contractInterface) {
  if (!receipt) return { success: false, pending: true };
  if (Number(receipt.status) !== 1) return { success: false, reverted: true, error: 'The launch transaction reverted. No social token was issued.' };
  let tokenId = null, tokenAddress = null, poolId = null;
  for (const log of receipt.logs || []) {
    if (String(log.address).toLowerCase() !== contractAddress.toLowerCase()) continue;
    try {
      const parsed = contractInterface.parseLog(log);
      if (parsed?.name === 'CompanionMinted' || parsed?.name === 'Registered') tokenId = String(parsed.args.tokenId ?? parsed.args.agentId);
      if (parsed?.name === 'CompanionEconomyLaunched') { tokenAddress = parsed.args.token; poolId = parsed.args.poolId; }
    } catch { /* Other contract events are not launch receipts. */ }
  }
  if (!tokenId || !tokenAddress) return { success: false, pending: true, error: 'The transaction confirmed, but its launch details could not be verified. Check the transaction before trying again.' };
  return { success: true, tokenId, tokenAddress, poolId, txHash: receipt.hash };
}
