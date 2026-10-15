import { ethers } from 'ethers';

// A human-approved job action authorizes exactly one zero-value contract call.
export function restrictAgentJobSigner(signer, { escrowAddress, chainId, data }) {
  let consumed = false;
  return {
    provider: signer.provider,
    getAddress: () => signer.getAddress(),
    async sendTransaction(transaction) {
      const tx = await ethers.resolveProperties(transaction);
      if (consumed) throw new Error('This job approval has already been used.');
      if (String(tx.to).toLowerCase() !== escrowAddress.toLowerCase() || String(tx.data).toLowerCase() !== data.toLowerCase()
        || BigInt(tx.value || 0) !== 0n || (tx.chainId != null && BigInt(tx.chainId) !== BigInt(chainId))) {
        throw new Error('Transaction is outside the approved smart-agent job action.');
      }
      consumed = true;
      return signer.sendTransaction({ ...tx, chainId, value: 0n });
    },
  };
}
