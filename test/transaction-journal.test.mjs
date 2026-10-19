import test from "node:test";
import assert from "node:assert/strict";
import {
  recordTransaction,
  listTransactions,
  refreshTransaction,
  assertNoPendingPayment,
} from "../src/services/transactionJournal.js";
import { confirmedReceipt } from "../src/services/transactionReceipt.js";
const hash = (n) => "0x" + n.toString(16).padStart(64, "0"),
  wallet = "0x" + "1".repeat(40),
  to = "0x" + "2".repeat(40);
let stored = "[]";
globalThis.localStorage = {
  getItem: () => stored,
  setItem: (_k, v) => (stored = v),
};
test("unknown confirmation remains pending and prevents a second payment to the same contract", async () => {
  const tx = {
    hash: hash(1),
    from: wallet,
    to,
    chainId: 4663,
    nonce: 1,
    wait: async () => {
      throw new Error("RPC timeout");
    },
  };
  await assert.rejects(
    confirmedReceipt(tx),
    (e) => e.confirmationPending && e.transactionHash === tx.hash,
  );
  const provider = {
    send: async () => "0x1237",
    getTransactionReceipt: async () => null,
  };
  await assert.rejects(
    assertNoPendingPayment(4663, wallet, provider, [to]),
    /previous payment/,
  );
  provider.getTransactionReceipt = async () => ({ hash: tx.hash, status: 1 });
  await assertNoPendingPayment(4663, wallet, provider, [to]);
  assert.equal(listTransactions(4663, wallet)[0].status, "confirmed");
});
test("successful replacements retain the original identity and final receipt", async () => {
  const tx = {
    hash: hash(2),
    from: wallet,
    to,
    chainId: 4663,
    wait: async () => {
      throw {
        code: "TRANSACTION_REPLACED",
        cancelled: false,
        receipt: { hash: hash(3), status: 1 },
      };
    },
  };
  await confirmedReceipt(tx);
  const r = listTransactions(4663, wallet).find(
    (r) => r.originalHash === hash(2),
  );
  assert.equal(r.hash, hash(3));
  assert.equal(r.status, "confirmed");
  await assert.rejects(
    refreshTransaction(r, { send: async () => "0x1" }),
    /Wrong network/,
  );
});
test("disk failure never loses the in-session transaction identity", () => {
  const old = localStorage.setItem;
  localStorage.setItem = () => {
    throw new Error("disk full");
  };
  recordTransaction(
    { hash: hash(4), from: wallet, to, chainId: 4663 },
    "pending",
  );
  assert.equal(
    listTransactions(4663, wallet).find((r) => r.hash === hash(4))
      .storageWarning,
    true,
  );
  localStorage.setItem = old;
});

test("a replacement without a verified receipt stays pending under its current hash", async () => {
  const tx = {
    hash: hash(5),
    from: wallet,
    to,
    chainId: 4663,
    wait: async () => {
      throw { code: "TRANSACTION_REPLACED", replacement: { hash: hash(6) } };
    },
  };
  await assert.rejects(
    confirmedReceipt(tx),
    (e) => e.confirmationPending && e.transactionHash === hash(6),
  );
  const row = listTransactions(4663, wallet).find(
    (r) => r.originalHash === hash(5),
  );
  assert.equal(row.hash, hash(6));
  assert.equal(row.status, "pending");
  await refreshTransaction(row, {
    send: async () => "0x1237",
    getTransactionReceipt: async (h) => {
      assert.equal(h, hash(6));
      return { hash: h, status: 1 };
    },
  });
  assert.equal(
    listTransactions(4663, wallet).find((r) => r.originalHash === hash(5))
      .status,
    "confirmed",
  );
});

test("an unconfirmed cancellation never authorizes a duplicate payment", async () => {
  const tx = {
    hash: hash(7),
    from: wallet,
    to,
    chainId: 4663,
    wait: async () => {
      throw { cancelled: true };
    },
  };
  await assert.rejects(confirmedReceipt(tx), (e) => e.confirmationPending);
  assert.equal(
    listTransactions(4663, wallet).find((r) => r.originalHash === hash(7))
      .status,
    "pending",
  );
});
