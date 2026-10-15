import { ethers } from 'ethers';

// Keep stake previews and submitted amounts in token units, including top-ups.
export function rewardStakePreview(amount, currentAmount, tiers) {
  try {
    if (!/^\d+(?:\.\d{1,18})?$/.test(String(amount))) return null;
    const added = ethers.parseEther(String(amount));
    if (added <= 0n) return null;
    const total = ethers.parseEther(String(currentAmount || '0')) + added;
    const tier = [...tiers].reverse().find(item => total >= ethers.parseEther(String(item.amount)));
    return { amount: ethers.formatEther(added), total: ethers.formatEther(total), tier: tier?.tier || 0 };
  } catch { return null; }
}

export function amountToReachLevel(currentAmount, threshold) {
  const difference = ethers.parseEther(String(threshold)) - ethers.parseEther(String(currentAmount || '0'));
  return difference > 0n ? ethers.formatEther(difference) : '';
}

export function rewardWithdrawalReady(state, nowSeconds) {
  return Boolean(state.position && !state.rewardActive
    && ethers.parseEther(state.position.amountExact || String(state.position.amount || 0)) > 0n
    && nowSeconds >= Math.max(state.rewardExitAt || 0, state.position.lockedUntil || 0));
}
