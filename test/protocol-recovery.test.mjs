import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ethers } from "ethers";
import { CONFIG } from "../src/config/web3.config.js";
import { BonzaiJobEscrowABI } from "../src/contracts/abi/BonzaiJobEscrow.abi.js";
const addr = (n) => "0x" + n.toString(16).padStart(40, "0");
const wallet = addr(1),
  worker = addr(2),
  arbitrator = addr(3),
  jobId = "0x" + "a".repeat(64);
CONFIG.contributionEconomy.jobEscrowAddress = addr(4);
const abi = new ethers.Interface(BonzaiJobEscrowABI);
let signerCalls = 0,
  blockTime = 100,
  chainId = CONFIG.contributionEconomy.chainId;
const provider = {
  send: async () => ethers.toQuantity(chainId),
  getBlock: async () => ({ timestamp: blockTime }),
  call: async ({ data }) => {
    const fn = abi.getFunction(data.slice(0, 10));
    const result = {
      getWalletJobs: [[jobId]],
      pendingContributions: [500000000000000000n],
      contributionFallbackAt: [100],
      jobs: [
        wallet,
        worker,
        1,
        1000000000000000000n,
        ethers.ZeroHash,
        ethers.ZeroHash,
        ethers.ZeroHash,
        6,
      ],
      jobTerms: [arbitrator, 10, 20, 30, 100, 3],
      jobCurrency: [ethers.ZeroAddress],
      settlementProposals: [worker, 2500],
    }[fn.name];
    if (!result) throw new Error(`Unexpected ${fn.name}`);
    return abi.encodeFunctionResult(fn, result);
  },
};
globalThis.__recoveryWeb3 = {
  state: { walletAddress: wallet },
  getProvider: async () => provider,
  switchNetwork: async () => {},
  getBrowserProvider: async () => ({
    getSigner: async () => {
      signerCalls++;
      return { getAddress: async () => wallet, provider };
    },
  }),
};
const url = new URL("../src/services/protocolRecovery.js", import.meta.url);
let source = (await readFile(url, "utf8")).replace(
  /^import \{ web3Service \} from .*;$/m,
  "const web3Service=globalThis.__recoveryWeb3;",
);
source = source.replace(
  /from ['"]([^'"]+)['"]/g,
  (_, spec) =>
    `from '${spec.startsWith(".") ? new URL(spec, url).href : import.meta.resolve(spec)}'`,
);
const recovery = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
test("deadline recovery uses verified chain time, including the exact expiry boundary", async () => {
  blockTime = 100;
  let page = await recovery.discoverWalletJobs(wallet);
  assert.equal(page.rows[0].expired, false);
  blockTime = 101;
  page = await recovery.discoverWalletJobs(wallet);
  assert.equal(page.rows[0].expired, true);
  assert.equal(signerCalls, 0);
});
test("a missing local brief does not prevent inspecting a party proposal or appointed arbitration", async () => {
  blockTime = 100;
  const party = await recovery.inspectRecoveryJob(jobId, wallet);
  assert.equal(party.amount, "1.0");
  assert.equal(party.workerBps, 2500);
  assert.equal(party.isParty, true);
  assert.equal(party.isArbitrator, false);
  const judge = await recovery.inspectRecoveryJob(jobId, arbitrator);
  assert.equal(judge.isArbitrator, true);
  assert.equal(judge.canArbitrate, true);
  blockTime = 101;
  assert.equal(
    (await recovery.inspectRecoveryJob(jobId, arbitrator)).canArbitrate,
    false,
  );
  const spectator = await recovery.inspectRecoveryJob(jobId, addr(8));
  assert.equal(spectator.isParty, false);
  assert.equal(spectator.isArbitrator, false);
  assert.equal(spectator.canFallback, true);
  assert.equal(signerCalls, 0);
});
test("malformed financial actions and changed wallet or network cannot submit settlement", async () => {
  for (const [action, bps] of [
    ["acceptSettlement", 10001],
    ["resolveDispute", -1],
    ["transfer", 1000],
  ])
    await assert.rejects(
      recovery.settleRecoveryJob(jobId, action, bps, wallet),
      /Invalid settlement|Worker share/,
    );
  assert.equal(signerCalls, 0);
  await assert.rejects(
    recovery.settleRecoveryJob(jobId, "acceptSettlement", 2500, addr(8)),
    /Wallet changed/,
  );
  chainId = 1;
  await assert.rejects(
    recovery.settleRecoveryJob(jobId, "acceptSettlement", 2500, wallet),
    /Network changed/,
  );
});
