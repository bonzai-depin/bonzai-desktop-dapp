import { recordTransaction } from "./transactionJournal.js";
/** A timeout after submission is not a failed transaction and must not invite repayment. */
export async function confirmedReceipt(transaction) {
  recordTransaction(transaction, "pending");
  try {
    const receipt = await transaction.wait();
    if (!receipt) throw new Error("Confirmation unavailable");
    if (Number(receipt.status) === 0)
      throw Object.assign(new Error("Transaction reverted."), { receipt });
    recordTransaction(transaction, "confirmed", receipt);
    return receipt;
  } catch (error) {
    if (
      error.code === "TRANSACTION_REPLACED" &&
      !error.cancelled &&
      Number(error.receipt?.status) === 1
    ) {
      recordTransaction(transaction, "confirmed", error.receipt);
      return error.receipt;
    }
    if (
      (error.cancelled && Number(error.receipt?.status) === 1) ||
      Number(error.receipt?.status) === 0
    ) {
      recordTransaction(
        transaction,
        error.cancelled ? "cancelled" : "reverted",
        error.receipt,
      );
      throw error;
    }
    if (error.replacement?.hash)
      recordTransaction(
        {
          ...transaction,
          originalHash: transaction.hash,
          hash: error.replacement.hash,
        },
        "pending",
      );
    throw Object.assign(
      new Error(
        "Transaction submitted; confirmation is not yet verified. Check its receipt before trying again.",
      ),
      {
        transactionHash: error.replacement?.hash || transaction.hash,
        confirmationPending: true,
      },
    );
  }
}
