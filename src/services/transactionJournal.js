const KEY = "bonzai.protocol.transactions.v1";
const volatile = new Map();
export function listTransactions(chainId, wallet) {
  let saved = [];
  try {
    saved = JSON.parse(globalThis.localStorage?.getItem(KEY) || "[]");
  } catch {
    /* retain in-memory receipts */
  }
  const rows = new Map(
    (Array.isArray(saved) ? saved : []).map((r) => [
      `${r.chainId}:${r.originalHash}`,
      r,
    ]),
  );
  for (const [key, value] of volatile) rows.set(key, value);
  return [...rows.values()]
    .filter(
      (r) =>
        (!chainId || r.chainId === String(chainId)) &&
        (!wallet || r.from?.toLowerCase() === wallet.toLowerCase()),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}
export function recordTransaction(tx, status, receipt) {
  if (!/^0x[\da-f]{64}$/i.test(tx?.hash || "")) return;
  const chainId = String(tx.chainId || ""),
    originalHash = tx.originalHash || tx.hash;
  const prior = listTransactions().find(
    (r) => r.chainId === chainId && r.originalHash === originalHash,
  );
  const row = {
    ...prior,
    chainId,
    originalHash,
    hash: receipt?.hash || tx.hash,
    from: tx.from,
    to: tx.to || prior?.to,
    status,
    nonce: tx.nonce,
    createdAt: prior?.createdAt || Date.now(),
  };
  volatile.set(`${chainId}:${originalHash}`, row);
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(listTransactions()));
  } catch {
    row.storageWarning = true;
  }
  globalThis.window?.dispatchEvent(new Event("bonzai:protocol-transactions"));
}
export async function refreshTransaction(row, provider) {
  const actual = BigInt(await provider.send("eth_chainId", []));
  if (actual !== BigInt(row.chainId))
    throw new Error("Wrong network for this receipt.");
  const receipt = await provider.getTransactionReceipt(row.hash);
  if (receipt)
    recordTransaction(
      { ...row, hash: row.hash },
      Number(receipt.status) === 1 ? "confirmed" : "reverted",
      receipt,
    );
  return receipt;
}

/** Financial retries must not turn an RPC timeout into a second purchase. */
export async function assertNoPendingPayment(
  chainId,
  wallet,
  provider,
  destinations,
) {
  const targets = new Set(
    destinations.filter(Boolean).map((a) => a.toLowerCase()),
  );
  for (const row of listTransactions(chainId, wallet).filter(
    (r) => r.status === "pending" && targets.has(r.to?.toLowerCase()),
  )) {
    const receipt = await refreshTransaction(row, provider);
    if (!receipt)
      throw Object.assign(
        new Error(
          "A previous payment is still awaiting confirmation. Check its receipt in Rewards before paying again.",
        ),
        { confirmationPending: true, transactionHash: row.hash },
      );
  }
}
