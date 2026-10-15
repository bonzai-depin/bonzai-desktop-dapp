import { ethers } from 'ethers';

export const BASKET_CURRENCY_PAGE = 8;
export const BASKET_EPOCH_PAGE = 8;

export function closedEpochPage(currentEpoch, beforeEpoch = currentEpoch) {
  const end = Math.max(0, Math.min(Number(currentEpoch), Number(beforeEpoch)));
  const start = Math.max(0, end - BASKET_EPOCH_PAGE);
  return { start, end, epochs: Array.from({ length: end - start }, (_, i) => start + i) };
}

// Never add unlike currencies or convert token units through floating point.
export async function readRewardBasket(contract, wallet, metadata, { currencyOffset = 0, beforeEpoch } = {}) {
  const [epoch, count, duration, genesis, currencies] = await Promise.all([
    contract.currentEpoch(), contract.rewardCurrencyCount(), contract.epochDuration(), contract.genesisTime(),
    contract.getRewardCurrencies(currencyOffset, BASKET_CURRENCY_PAGE),
  ]);
  const page = closedEpochPage(epoch, beforeEpoch);
  const rows = await Promise.all(currencies.map(async currency => {
    try {
      const token = await metadata(currency);
      const amounts = await Promise.all(page.epochs.map(id => contract.claimable(wallet, currency, id)));
      const claimEpochs = page.epochs.filter((_, i) => amounts[i] > 0n);
      const rawAmount = amounts.reduce((sum, value) => sum + BigInt(value), 0n);
      return { ...token, address: currency, rawAmount: rawAmount.toString(), amount: ethers.formatUnits(rawAmount, token.decimals), claimEpochs, error: '' };
    } catch (error) {
      return { address: currency, symbol: `${currency.slice(0, 6)}…${currency.slice(-4)}`, amount: null, rawAmount: null, claimEpochs: [], error: error.shortMessage || error.message };
    }
  }));
  return { rows, currentEpoch: Number(epoch), currencyCount: Number(count), currencyOffset, epochDuration: Number(duration), genesisTime: Number(genesis), ...page };
}

export function assertClaimableRow(row) {
  if (!row || row.error || !row.claimEpochs?.length || BigInt(row.rawAmount || 0) <= 0n) throw new Error('No claimable rewards in this currency.');
  if (row.claimEpochs.length > 32) throw new Error('Claim at most 32 epochs at a time.');
}
