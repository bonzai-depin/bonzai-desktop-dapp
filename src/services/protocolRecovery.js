import { ethers } from "ethers";
import { CONFIG, ECONOMY_NETWORK_KEY } from "../config/web3.config.js";
import { web3Service } from "./web3.service.js";
import { BonzaiMintPoolABI } from "../contracts/abi/BonzaiMintPool.abi.js";
import { BonzaiRevenueRouterABI } from "../contracts/abi/BonzaiRevenueRouter.abi.js";
import { BonzaiJobEscrowABI } from "../contracts/abi/BonzaiJobEscrow.abi.js";
import { confirmedReceipt } from "./transactionReceipt.js";
const tokenAbi = [
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
];
const config = () => CONFIG.contributionEconomy;
async function client(kind, write = false, expected) {
  const address =
    kind === "pool"
      ? CONFIG.mintPool.contractAddress
      : kind === "router"
        ? CONFIG.stakingEconomy.revenueRouterAddress
        : config().jobEscrowAddress;
  if (!ethers.isAddress(address || "") || address === ethers.ZeroAddress)
    throw new Error("This contract is not configured.");
  let runner;
  if (write) {
    await web3Service.switchNetwork(ECONOMY_NETWORK_KEY);
    runner = await (await web3Service.getBrowserProvider()).getSigner();
    if (
      !expected ||
      (await runner.getAddress()).toLowerCase() !== expected.toLowerCase() ||
      web3Service.state.walletAddress?.toLowerCase() !== expected.toLowerCase()
    )
      throw new Error("Wallet changed. Refresh balances.");
    if (
      Number(BigInt(await runner.provider.send("eth_chainId", []))) !==
      Number(config().chainId)
    )
      throw new Error("Network changed.");
  } else runner = await web3Service.getProvider(ECONOMY_NETWORK_KEY);
  return new ethers.Contract(
    address,
    kind === "pool"
      ? BonzaiMintPoolABI
      : kind === "router"
        ? BonzaiRevenueRouterABI
        : BonzaiJobEscrowABI,
    runner,
  );
}
async function currencyInfo(currency, provider) {
  if (currency === ethers.ZeroAddress)
    return {
      symbol: CONFIG.networks[ECONOMY_NETWORK_KEY].currency.symbol,
      decimals: 18,
    };
  const c = new ethers.Contract(currency, tokenAbi, provider),
    [d, s] = await Promise.all([c.decimals(), c.symbol()]);
  if (!Number.isInteger(Number(d)) || Number(d) > 36)
    throw new Error("Unsupported currency precision.");
  return { symbol: String(s).slice(0, 32), decimals: Number(d) };
}
async function addBalance(rows, kind, currency, amount, provider, assetId) {
  if (amount === 0n) return;
  const info = await currencyInfo(currency, provider);
  rows.push({
    kind,
    currency,
    assetId,
    ...info,
    raw: amount.toString(),
    amount: ethers.formatUnits(amount, info.decimals),
  });
}
/** Cursor is explicit: large registries are browsable without silent truncation. */
export async function discoverRoyalties(wallet, offset = 0, limit = 20) {
  const c = await client("router"),
    ids = await c.getRouteIds(offset, limit),
    rows = [];
  for (const id of ids) {
    const route = await c.getRoute(id);
    const eligible = route.recipients.some(
      (r) => r.wallet.toLowerCase() === wallet.toLowerCase(),
    );
    if (eligible)
      await addBalance(
        rows,
        "royalty",
        ethers.ZeroAddress,
        await c.claimable(id, wallet),
        c.runner,
        id,
      );
    const basket = await c.routeBasket(id);
    if (basket !== ethers.ZeroAddress)
      await addBalance(
        rows,
        "basket",
        ethers.ZeroAddress,
        await c.pendingBasket(basket, ethers.ZeroAddress),
        c.runner,
        basket,
      );
    for (let start = 0; ; start += 100) {
      const currencies = await c.getRouteCurrencies(id, start, 100);
      for (const currency of currencies) {
        if (eligible)
          await addBalance(
            rows,
            "royalty",
            currency,
            await c.tokenClaimable(id, currency, wallet),
            c.runner,
            id,
          );
        await addBalance(
          rows,
          "treasury",
          currency,
          await c.tokenTreasuryClaimable(currency, wallet),
          c.runner,
        );
        if (basket !== ethers.ZeroAddress)
          await addBalance(
            rows,
            "basket",
            currency,
            await c.pendingBasket(basket, currency),
            c.runner,
            basket,
          );
      }
      if (currencies.length < 100) break;
    }
  }
  if (offset === 0)
    await addBalance(
      rows,
      "treasury",
      ethers.ZeroAddress,
      await c.nativeTreasuryClaimable(wallet),
      c.runner,
    );
  return {
    rows,
    next: offset + ids.length,
    hasMore: BigInt(offset + ids.length) < (await c.routeCount()),
  };
}
export async function discoverPayments(wallet) {
  const c = await client("escrow"),
    rows = [];
  await addBalance(
    rows,
    "payment",
    ethers.ZeroAddress,
    await c.withdrawable(wallet),
    c.runner,
  );
  for (let start = 0; ; start += 100) {
    const currencies = await c.getPaymentCurrencies(wallet, start, 100);
    for (const currency of currencies)
      await addBalance(
        rows,
        "payment",
        currency,
        await c.tokenWithdrawable(currency, wallet),
        c.runner,
      );
    if (currencies.length < 100) break;
  }
  return rows;
}
export async function claimRecovered(row, wallet, recipient = wallet) {
  if (!ethers.isAddress(recipient) || recipient === ethers.ZeroAddress)
    throw new Error("Enter a valid receiving wallet.");
  const c = await client(
    row.kind === "payment" ? "escrow" : "router",
    true,
    wallet,
  );
  let tx;
  if (row.kind === "basket")
    tx = await c.forwardBasket(row.assetId, row.currency);
  else if (row.kind === "payment")
    tx =
      row.currency === ethers.ZeroAddress
        ? await c.withdrawPayments(recipient)
        : await c.withdrawTokenPayments(row.currency, recipient);
  else if (row.kind === "treasury")
    tx =
      row.currency === ethers.ZeroAddress
        ? await c.claimTreasury(recipient)
        : await c.claimTokenTreasury(row.currency, recipient);
  else
    tx =
      row.currency === ethers.ZeroAddress
        ? await c.claimTo(row.assetId, recipient)
        : await c.claimToken(row.assetId, row.currency, recipient);
  return confirmedReceipt(tx);
}

/** Recover deadlines without the private brief; this never reconstructs or shares its contents. */
export async function discoverWalletJobs(wallet, offset = 0, limit = 20) {
  const c = await client("escrow"),
    ids = await c.getWalletJobs(wallet, offset, limit),
    rows = [];
  const block = await c.runner.getBlock("latest");
  if (!block)
    throw new Error(
      "Could not verify the current chain time. Retry before finalizing a job.",
    );
  for (const id of ids) {
    const [job, terms, pending] = await Promise.all([
      c.jobs(id),
      c.jobTerms(id),
      c.pendingContributions(id),
    ]);
    const status = Number(job.status),
      deadline = Number(
        status === 1
          ? terms.acceptBy
          : status === 2
            ? terms.deliverBy
            : status === 3
              ? terms.reviewBy
              : status === 6
                ? terms.resolveBy
                : 0,
      );
    if (deadline || pending > 0n)
      rows.push({
        id,
        status,
        deadline,
        expired: Number(block.timestamp) > deadline,
        employer: job.employer,
        worker: job.worker,
        hasPendingRoyalties: pending > 0n,
      });
  }
  return { rows, next: offset + ids.length, hasMore: ids.length === limit };
}
export async function finalizeExpiredJob(id, wallet) {
  const c = await client("escrow", true, wallet);
  return confirmedReceipt(await c.expireJob(id));
}

/** An arbitrator or a party can recover a job by its public ID without its private brief. */
export async function inspectRecoveryJob(id, wallet) {
  if (!ethers.isHexString(id, 32) || id === ethers.ZeroHash)
    throw new Error("Enter the full job ID.");
  const c = await client("escrow");
  const [job, terms, currency, proposal, block, pending, fallbackAt] =
    await Promise.all([
      c.jobs(id),
      c.jobTerms(id),
      c.jobCurrency(id),
      c.settlementProposals(id),
      c.runner.getBlock("latest"),
      c.pendingContributions(id),
      c.contributionFallbackAt(id),
    ]);
  if (!Number(job.status)) throw new Error("Job not found on this network.");
  if (!block) throw new Error("Could not verify chain time.");
  const isParty = [job.employer, job.worker].some(
    (a) => a.toLowerCase() === wallet.toLowerCase(),
  );
  const isArbitrator = terms.arbitrator.toLowerCase() === wallet.toLowerCase();
  const info = await currencyInfo(currency, c.runner);
  const basketPending =
    currency === ethers.ZeroAddress ? 0n : await c.pendingBasketFees(currency);
  return {
    id,
    status: Number(job.status),
    employer: job.employer,
    worker: job.worker,
    arbitrator: terms.arbitrator,
    isParty,
    isArbitrator,
    canArbitrate:
      Number(job.status) === 6 &&
      Number(block.timestamp) <= Number(terms.resolveBy),
    proposer: proposal.proposer,
    workerBps: Number(proposal.workerBps),
    currency,
    ...info,
    amount: ethers.formatUnits(job.amount, info.decimals),
    pendingRoyalties: ethers.formatUnits(pending, info.decimals),
    hasPendingRoyalties: pending > 0n,
    canFallback: pending > 0n && Number(block.timestamp) >= Number(fallbackAt),
    fallbackAt: Number(fallbackAt),
    pendingHolderRewards: ethers.formatUnits(basketPending, info.decimals),
    hasPendingHolderRewards: basketPending > 0n,
  };
}

export async function routeRecoveryFees(id, action, wallet) {
  if (
    !ethers.isHexString(id, 32) ||
    ![
      "routeContribution",
      "distributeContributionFallback",
      "routeBasketFees",
    ].includes(action)
  )
    throw new Error("Invalid fee recovery action.");
  const c = await client("escrow", true, wallet);
  const argument = action === "routeBasketFees" ? await c.jobCurrency(id) : id;
  return confirmedReceipt(await c[action](argument));
}

export async function settleRecoveryJob(id, action, workerBps, wallet) {
  if (
    !ethers.isHexString(id, 32) ||
    !["proposeSettlement", "acceptSettlement", "resolveDispute"].includes(
      action,
    )
  )
    throw new Error("Invalid settlement action.");
  if (!Number.isInteger(workerBps) || workerBps < 0 || workerBps > 10000)
    throw new Error("Worker share must be between 0% and 100%.");
  const c = await client("escrow", true, wallet);
  // acceptSettlement checks this exact proposal share onchain to prevent accepting changed terms.
  return confirmedReceipt(await c[action](id, workerBps));
}

export async function setNativeRewardRecipient(wallet, recipient) {
  if (!ethers.isAddress(recipient) || recipient === ethers.ZeroAddress)
    throw new Error("Enter a valid receiving wallet.");
  const c = await client("pool", true, wallet);
  return confirmedReceipt(await c.setRewardRecipient(recipient));
}
export async function rollEmptyRewards(wallet, epoch, pool, providerSide) {
  if (
    !Number.isSafeInteger(epoch) ||
    epoch < 0 ||
    !Number.isInteger(pool) ||
    pool < 0 ||
    pool > 5
  )
    throw new Error("Select a valid epoch and pool.");
  const c = await client("pool", true, wallet);
  return confirmedReceipt(
    await c.rollEmptyAllocation(epoch, pool, providerSide),
  );
}
