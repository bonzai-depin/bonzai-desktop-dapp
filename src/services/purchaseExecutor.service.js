/**
 * Companion wallets are protocol-owned revenue receivers. Autonomous spending
 * is intentionally outside the production product boundary.
 */
async function executePurchase() {
  return {
    success: false,
    error: 'Companion wallets are revenue-only and cannot initiate purchases.',
  };
}

export const purchaseExecutorService = { executePurchase };

export default purchaseExecutorService;
