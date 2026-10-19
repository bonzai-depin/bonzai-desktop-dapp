/** Illustrative unit-economics model, not observed adoption or a revenue forecast.
 * USD equivalents; gas, tax, FX, support, R&D and non-acquisition operating costs excluded.
 * Local inference is free. Deposits, staking principal and token market cap are never revenue.
 */
export const ECONOMY_DEFAULTS = Object.freeze({
  baselineDownloads: 10000,
  targetDownloads: 1000000,
  attainment: 1,
  acquisitionBudget: 2000,
  // Current approved economics (1), or the former policy for comparison (0).
  approvedCapture: 1,
  firstLaunch: 0.75,
  activation: 0.4,
  retention: 0.65,
  workflowConversion: 0.03,
  workflowSpend: 25,
  contributionCoverage: 1,
  unlockConversion: 0.01,
  unlockPrice: 75,
  mintConversion: 0.01,
  mintSpend: 2,
  workspacePaymentsEnabled: 0,
  workspaceLiquidityShare: 0,
  tradingPerActive: 10,
  vaultFeeShare: 1,
  paidShare: 1000 / 990000,
  costPerDownload: 2,
  creatorShare: 0.45,
  creatorDownloads: 350,
  creatorCost: 0,
  partnerShare: 0.3,
  partnerDownloads: 5000,
  partnerCost: 0,
  referralShare: 0.1,
  invitations: 2,
  inviteConversion: 0.2,
  landingConversion: 0.2,
  fixedGrowthCost: 0,
});
export const ECONOMY_MONTHS = Object.freeze([
  ["Oct 2026", 13, 0.02],
  ["Nov 2026", 30, 0.05],
  ["Dec 2026", 31, 0.1],
  ["Jan 2027", 31, 0.18],
  ["Feb 2027", 28, 0.25],
  ["Mar 2027", 31, 0.4],
]);
const fractions = [
  "firstLaunch",
  "activation",
  "retention",
  "workflowConversion",
  "contributionCoverage",
  "unlockConversion",
  "mintConversion",
  "paidShare",
  "creatorShare",
  "partnerShare",
  "referralShare",
  "inviteConversion",
  "landingConversion",
  "workspaceLiquidityShare",
  "vaultFeeShare",
];
export function simulateEconomy(input = {}) {
  const p = { ...ECONOMY_DEFAULTS, ...input };
  for (const [key, value] of Object.entries(p))
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`Invalid assumption: ${key}`);
  for (const key of fractions)
    if (p[key] > 1) throw new Error(`${key} must be between 0 and 1`);
  if (p.attainment > 2) throw new Error("Attainment must be at most 200%");
  if (![0, 1].includes(p.workspacePaymentsEnabled))
    throw new Error("Workspace payments must be disabled (0) or enabled (1)");
  if (![0, 1].includes(p.approvedCapture))
    throw new Error("Capture policy must be former policy (0) or approved policy (1)");
  if (
    p.creatorDownloads <= 0 ||
    p.partnerDownloads <= 0 ||
    p.landingConversion <= 0
  )
    throw new Error("Channel yields and conversion must be positive");
  if (
    p.paidShare + p.creatorShare + p.partnerShare + p.referralShare >
    1 + 1e-9
  )
    throw new Error("Acquisition shares exceed 100%");
  const additional = Math.max(0, p.targetDownloads - p.baselineDownloads),
    rows = [];
  let cumulative = p.baselineDownloads,
    active = 0,
    priorPlanned = 0;
  for (const [index, [month, days, weight]] of ECONOMY_MONTHS.entries()) {
    // Integer monthly counts sum to the requested attained target without accumulating rounding drift.
    const planned = Math.round(
      additional *
        p.attainment *
        ECONOMY_MONTHS.slice(0, index + 1).reduce((s, m) => s + m[2], 0),
    );
    const downloads = planned - priorPlanned;
    priorPlanned = planned;
    cumulative += downloads;
    const newActive = downloads * p.firstLaunch * p.activation,
      retained = active * p.retention;
    const referralCapacity = retained * p.invitations * p.inviteConversion;
    active = newActive + retained;
    const periodFraction = index === 0 ? days / 31 : 1;
    const payers = active * p.workflowConversion,
      workflowGMV = payers * p.workflowSpend * periodFraction;
    // Contributor royalties come from the 70% service allocation, with no
    // second router fee. No royalties are charged when there is no route.
    const creators = workflowGMV * 0.025 * p.contributionCoverage * (p.approvedCapture ? 1 : 0.8);
    const worker = workflowGMV * (p.approvedCapture ? 0.7 : 0.975) - workflowGMV * 0.025 * p.contributionCoverage;
    const workflowTreasury = workflowGMV * (p.approvedCapture ? 0.2 : 0.0125 + 0.0025 * p.contributionCoverage);
    const workflowRewards = p.approvedCapture ? workflowGMV * 0.1 : workflowTreasury;
    const workflowOtherStakeholders = 0;
    // The current app allows temporary free workspace access. Its checkout is
    // distinct from BonzaiUnlock, so no legacy 50/50 split is silently applied.
    const licenses =
        newActive * p.unlockConversion * p.workspacePaymentsEnabled,
      licenseReceipts = licenses * p.unlockPrice;
    const mints = active * p.mintConversion * p.mintSpend * periodFraction;
    const tradingVolume = active * p.tradingPerActive * periodFraction,
      tradingFees = tradingVolume * 0.01 * p.vaultFeeShare;
    // Agents split their 70% equally between wallet and NFT owner.
    const tradingBeneficiaries = tradingFees * (p.approvedCapture ? 0.7 : 0.8),
      tradingTreasury = tradingFees * (p.approvedCapture ? 0.2 : 0.1),
      tradingRewards = tradingFees * 0.1;
    const treasury =
      workflowTreasury +
      tradingTreasury +
      mints * 0.8 +
      licenseReceipts * (1 - p.workspaceLiquidityShare);
    const holderRewards = (workflowRewards ?? 0) + tradingRewards + mints * 0.1;
    const providerPool = mints * 0.1,
      liquidityReserve = licenseReceipts * p.workspaceLiquidityShare;
    const creatorPlacements = Math.ceil(
      (downloads * p.creatorShare) / p.creatorDownloads,
    );
    const partners = Math.ceil(
      (downloads * p.partnerShare) / p.partnerDownloads,
    );
    const paidCost = downloads * p.paidShare * p.costPerDownload;
    const creatorCost = creatorPlacements * p.creatorCost,
      partnerCost = partners * p.partnerCost;
    const acquisitionCost =
      paidCost + creatorCost + partnerCost + p.fixedGrowthCost;
    const feeRevenue =
      workflowGMV * (p.approvedCapture ? 0.3 + 0.025 * p.contributionCoverage : 0.025 + 0.025 * p.contributionCoverage) +
      tradingFees +
      mints +
      licenseReceipts;
    rows.push({
      month,
      days,
      periodFraction,
      downloads,
      cumulative,
      daily: downloads / days,
      newActive,
      retained,
      active,
      payers,
      workflowGMV,
      worker,
      creators,
      workflowTreasury,
      workflowRewards,
      workflowOtherStakeholders,
      licenses,
      licenseReceipts,
      mints,
      tradingVolume,
      tradingFees,
      tradingBeneficiaries,
      tradingTreasury,
      tradingRewards,
      treasury,
      holderRewards,
      providerPool,
      liquidityReserve,
      feeRevenue,
      creatorPlacements,
      partners,
      paidCost,
      creatorCost,
      partnerCost,
      acquisitionCost,
      treasuryAfterAcquisition: treasury - acquisitionCost,
      paidDownloads: downloads * p.paidShare,
      creatorDownloadTarget: downloads * p.creatorShare,
      partnerDownloadTarget: downloads * p.partnerShare,
      referralTarget: downloads * p.referralShare,
      referralCapacity,
      ownedDownloadTarget:
        downloads *
        (1 - p.paidShare - p.creatorShare - p.partnerShare - p.referralShare),
      qualifiedVisits: downloads / p.landingConversion,
    });
  }
  const sum = (subset) =>
    Object.fromEntries(
      [
        "downloads",
        "newActive",
        "workflowGMV",
        "worker",
        "creators",
        "workflowTreasury",
        "workflowOtherStakeholders",
        "licenses",
        "licenseReceipts",
        "mints",
        "tradingVolume",
        "tradingFees",
        "tradingBeneficiaries",
        "tradingTreasury",
        "treasury",
        "holderRewards",
        "providerPool",
        "liquidityReserve",
        "feeRevenue",
        "acquisitionCost",
        "treasuryAfterAcquisition",
        "creatorPlacements",
        "partners",
        "qualifiedVisits",
      ].map((key) => [key, subset.some(r => r[key] === null) ? null : subset.reduce((n, r) => n + r[key], 0)]),
    );
  return {
    assumptions: p,
    workflowAllocationPending: false,
    rows,
    q4: sum(rows.slice(0, 3)),
    q1: sum(rows.slice(3)),
    total: sum(rows),
    gap: Math.max(0, p.targetDownloads - cumulative),
    budgetGap: Math.max(0, sum(rows).acquisitionCost - p.acquisitionBudget),
  };
}
