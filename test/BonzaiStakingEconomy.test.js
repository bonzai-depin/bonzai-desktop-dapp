const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture(treasuryAddress) {
  const [owner, alice, bob, treasury, payer] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const bonzai = await MockERC20.deploy("BONZAI", "BONZAI");

  const thresholds = [1000, 5000, 10000, 25000, 50000, 100000]
    .map(value => ethers.parseEther(String(value)));

  const StakingVault = await ethers.getContractFactory("BonzaiStakingVault");
  const stakingVault = await StakingVault.deploy(await bonzai.getAddress(), thresholds);

  const RevenueRouter = await ethers.getContractFactory("BonzaiRevenueRouter");
  const revenueRouter = await RevenueRouter.deploy(
    await stakingVault.getAddress(),
    treasuryAddress ?? treasury.address,
  );

  await bonzai.mint(alice.address, ethers.parseEther("10000"));
  await bonzai.mint(bob.address, ethers.parseEther("10000"));
  await bonzai.connect(alice).approve(await stakingVault.getAddress(), ethers.MaxUint256);
  await bonzai.connect(bob).approve(await stakingVault.getAddress(), ethers.MaxUint256);

  return { owner, alice, bob, treasury, payer, bonzai, stakingVault, revenueRouter };
}

describe("BonzAI staking-centered utility economy", function () {
  it("turns staked BONZAI into utility tier and contribution-adjusted weight", async function () {
    const { owner, alice, stakingVault } = await deployFixture();

    await stakingVault.connect(alice).stake(ethers.parseEther("5000"), 90 * 24 * 60 * 60);
    await stakingVault.connect(owner).setContributionScore(alice.address, 2500);

    const position = await stakingVault.positionOf(alice.address);

    expect(position.amount).to.equal(ethers.parseEther("5000"));
    expect(position.tier).to.equal(2);
    expect(position.contributionScore).to.equal(2500);
    expect(position.weight).to.be.gt(position.amount);
  });

  it("preserves contribution royalties and adds a separate staking bonus", async function () {
    const { alice, bob, treasury, payer, stakingVault, revenueRouter } = await deployFixture();
    const assetId = ethers.id("fine-tune-model-with-data-owners");

    await stakingVault.connect(alice).stake(ethers.parseEther("5000"), 180 * 24 * 60 * 60);
    await stakingVault.connect(bob).stake(ethers.parseEther("1000"), 0);

    await revenueRouter.connect(alice).registerRoute(
      assetId,
      "bonzai-model://lineage",
      [alice.address, bob.address],
      [6000, 4000],
      [2000, 8000],
      ["trainer", "data_owner"],
    );

    await revenueRouter.connect(payer).depositRevenue(assetId, { value: ethers.parseEther("1") });

    const aliceClaim = await revenueRouter.claimable(assetId, alice.address);
    const bobClaim = await revenueRouter.claimable(assetId, bob.address);

    expect(aliceClaim + bobClaim).to.equal(ethers.parseEther("0.9"));
    expect(aliceClaim).to.be.gt(ethers.parseEther("0.48"));
    expect(bobClaim).to.be.gt(ethers.parseEther("0.32"));
    expect(await ethers.provider.getBalance(treasury.address)).to.be.gt(ethers.parseEther("10000"));
  });

  it("prevents another wallet from replacing a contribution route", async function () {
    const { alice, bob, revenueRouter } = await deployFixture();
    const assetId = ethers.id("immutable-origin");
    await revenueRouter.connect(alice).registerRoute(assetId, "bonzai://origin", [alice.address], [10000], [9000], ["creator"]);
    await expect(
      revenueRouter.connect(bob).registerRoute(assetId, "bonzai://fake", [bob.address], [10000], [9000], ["creator"]),
    ).to.be.revertedWithCustomError(revenueRouter, "RouteAlreadyOwned");
  });

  it("allows an authorized evaluation registry to update contribution scores", async function () {
    const { owner, alice, bob, stakingVault } = await deployFixture();
    await stakingVault.connect(owner).setScoreAttestor(bob.address, true);
    await stakingVault.connect(bob).setContributionScore(alice.address, 8100);
    expect((await stakingVault.positionOf(alice.address)).contributionScore).to.equal(8100);
  });

  it("keeps utility tier thresholds strictly ordered", async function () {
    const { owner, stakingVault } = await deployFixture();
    await expect(stakingVault.connect(owner).setUtilityTierThreshold(2, ethers.parseEther("50000")))
      .to.be.revertedWithCustomError(stakingVault, "InvalidThreshold");
  });

  it("caps route size so revenue deposits remain executable", async function () {
    const { alice, revenueRouter } = await deployFixture();
    const wallets = Array(65).fill(alice.address);
    const baseBps = Array(65).fill(0);
    baseBps[0] = 10000;
    await expect(revenueRouter.connect(alice).registerRoute(
      ethers.id("oversized-route"),
      "bonzai://oversized",
      wallets,
      baseBps,
      Array(65).fill(0),
      Array(65).fill("contributor"),
    )).to.be.revertedWithCustomError(revenueRouter, "TooManyRecipients").withArgs(65);
  });

  it("records evidence-backed score attestations through the oracle", async function () {
    const { owner, alice, bob, stakingVault } = await deployFixture();
    const Oracle = await ethers.getContractFactory("BonzaiContributionScoreOracle");
    const oracle = await Oracle.deploy(await stakingVault.getAddress());
    await stakingVault.connect(owner).setScoreAttestor(await oracle.getAddress(), true);
    await oracle.connect(owner).setEvaluator(bob.address, true);
    const evidence = ethers.id("evaluation-registry-record-42");
    await expect(oracle.connect(bob).attestScore(alice.address, 7600, evidence))
      .to.emit(oracle, "ScoreAttested")
      .withArgs(alice.address, 7600, evidence, bob.address);
    expect((await stakingVault.positionOf(alice.address)).contributionScore).to.equal(7600);
  });
});

describe("Revenue accounting order and reentrancy (P14)", function () {
  const ONE = ethers.parseEther("1");
  // default split: treasury 10%, staking 10%, contributors 80%
  const TREASURY_PART = ethers.parseEther("0.1");
  const STAKING_PART = ethers.parseEther("0.1");
  const CONTRIBUTOR_PART = ethers.parseEther("0.8");

  async function totalReceived(router, assetId) {
    const [, , , , total] = await router.getRoute(assetId);
    return total;
  }

  it("completes all accounting before the first value transfer", async function () {
    const { alice, bob, payer, stakingVault, revenueRouter } = await deployFixture();

    const Inspection = await ethers.getContractFactory("InspectionTreasury");
    const inspection = await Inspection.deploy(await revenueRouter.getAddress());
    await revenueRouter.setTreasury(await inspection.getAddress());

    const assetId = ethers.id("accounting-order-weighted");
    await stakingVault.connect(alice).stake(ethers.parseEther("5000"), 180 * 24 * 60 * 60);
    await stakingVault.connect(bob).stake(ethers.parseEther("1000"), 0);
    await revenueRouter.connect(alice).registerRoute(
      assetId,
      "bonzai://order",
      [alice.address, bob.address],
      [6000, 4000],
      [2000, 8000],
      ["trainer", "data_owner"],
    );
    await inspection.configure(assetId, [alice.address, bob.address]);

    await revenueRouter.connect(payer).depositRevenue(assetId, { value: ONE });

    // The value callback fired during the single treasury transfer.
    expect(await inspection.receivedDuringDeposit()).to.equal(true);

    // Snapshot taken inside the callback already reflects the full accounting.
    expect(await inspection.snapTotalReceived()).to.equal(ONE);
    expect(await inspection.snapRoutedRevenue()).to.equal(CONTRIBUTOR_PART);
    expect(
      (await inspection.snapClaimable(alice.address)) + (await inspection.snapClaimable(bob.address)),
    ).to.equal(CONTRIBUTOR_PART + STAKING_PART);

    // Snapshots equal the settled post-deposit state.
    expect(await inspection.snapTotalReceived()).to.equal(await totalReceived(revenueRouter, assetId));
    expect(await inspection.snapRoutedRevenue()).to.equal(await revenueRouter.routedRevenue(assetId));
    expect(await inspection.snapClaimable(alice.address)).to.equal(
      await revenueRouter.claimable(assetId, alice.address),
    );
    expect(await inspection.snapClaimable(bob.address)).to.equal(
      await revenueRouter.claimable(assetId, bob.address),
    );
  });

  it("blocks reentrant deposit and records no double credit", async function () {
    const { alice, bob, revenueRouter } = await deployFixture();

    const Attacker = await ethers.getContractFactory("ReentrantDepositor");
    const attacker = await Attacker.deploy(await revenueRouter.getAddress());
    await revenueRouter.setTreasury(await attacker.getAddress());

    const assetId = ethers.id("reentrant-deposit");
    await revenueRouter.connect(alice).registerRoute(
      assetId,
      "bonzai://reenter",
      [alice.address, bob.address],
      [5000, 5000],
      [0, 0],
      ["a", "b"],
    );

    // The callback reenters depositRevenue; nonReentrant trips and the whole
    // transaction reverts, so no accounting slot is written.
    await expect(attacker.attack(assetId, ethers.parseEther("0.05"), { value: ONE }))
      .to.be.reverted;

    expect(await revenueRouter.routedRevenue(assetId)).to.equal(0);
    expect(await totalReceived(revenueRouter, assetId)).to.equal(0);
    expect(await revenueRouter.claimable(assetId, alice.address)).to.equal(0);
    expect(await revenueRouter.claimable(assetId, bob.address)).to.equal(0);
  });

  it("blocks reentrant claim with no double withdrawal", async function () {
    const { alice, payer, revenueRouter } = await deployFixture();

    const Claimer = await ethers.getContractFactory("ReentrantClaimer");
    const claimer = await Claimer.deploy(await revenueRouter.getAddress());
    const claimerAddr = await claimer.getAddress();

    const assetId = ethers.id("reentrant-claim");
    // claimer is a recipient; nobody stakes so the bonus returns to treasury.
    await revenueRouter.connect(alice).registerRoute(
      assetId,
      "bonzai://reclaim",
      [claimerAddr, alice.address],
      [5000, 5000],
      [0, 0],
      ["claimer", "publisher"],
    );
    await revenueRouter.connect(payer).depositRevenue(assetId, { value: ONE });

    const claimableBefore = await revenueRouter.claimable(assetId, claimerAddr);
    const balanceBefore = await ethers.provider.getBalance(claimerAddr);
    expect(claimableBefore).to.equal(CONTRIBUTOR_PART / 2n);

    await claimer.setAsset(assetId);
    // Reentrant claim trips the guard; the payout reverts entirely.
    await expect(claimer.claim()).to.be.reverted;

    expect(await revenueRouter.claimable(assetId, claimerAddr)).to.equal(claimableBefore);
    expect(await ethers.provider.getBalance(claimerAddr)).to.equal(balanceBefore);
  });

  it("routes the unallocatable staking bonus to treasury on a zero-weight route", async function () {
    const { alice, bob, treasury, payer, revenueRouter } = await deployFixture();

    const assetId = ethers.id("zero-weight-route");
    await revenueRouter.connect(alice).registerRoute(
      assetId,
      "bonzai://zero",
      [alice.address, bob.address],
      [6000, 4000],
      [0, 0],
      ["a", "b"],
    );

    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    await revenueRouter.connect(payer).depositRevenue(assetId, { value: ONE });
    const treasuryAfter = await ethers.provider.getBalance(treasury.address);

    // treasury receives its 10% plus the unallocatable 10% bonus, in one transfer.
    expect(treasuryAfter - treasuryBefore).to.equal(TREASURY_PART + STAKING_PART);
    expect(await revenueRouter.routedRevenue(assetId)).to.equal(CONTRIBUTOR_PART);
    // contributors keep exact base shares; no bonus is distributed.
    expect(await revenueRouter.claimable(assetId, alice.address)).to.equal(ethers.parseEther("0.48"));
    expect(await revenueRouter.claimable(assetId, bob.address)).to.equal(ethers.parseEther("0.32"));
  });

  it("reverts the whole deposit when the treasury transfer fails, restoring every slot", async function () {
    const { alice, bob, payer, revenueRouter } = await deployFixture();

    const Rejector = await ethers.getContractFactory("ETHRejector");
    const rejector = await Rejector.deploy();
    await revenueRouter.setTreasury(await rejector.getAddress());

    const assetId = ethers.id("failing-treasury");
    await revenueRouter.connect(alice).registerRoute(
      assetId,
      "bonzai://fail",
      [alice.address, bob.address],
      [5000, 5000],
      [0, 0],
      ["a", "b"],
    );

    const routerAddr = await revenueRouter.getAddress();
    const routerBefore = await ethers.provider.getBalance(routerAddr);
    const aliceBefore = await ethers.provider.getBalance(alice.address);

    await expect(revenueRouter.connect(payer).depositRevenue(assetId, { value: ONE }))
      .to.be.revertedWith("Treasury transfer failed");

    // transaction reverted: accounting slots and balances equal their pre-call values.
    expect(await ethers.provider.getBalance(routerAddr)).to.equal(routerBefore);
    expect(await ethers.provider.getBalance(alice.address)).to.equal(aliceBefore);
    expect(await revenueRouter.routedRevenue(assetId)).to.equal(0);
    expect(await totalReceived(revenueRouter, assetId)).to.equal(0);
    expect(await revenueRouter.claimable(assetId, alice.address)).to.equal(0);
    expect(await revenueRouter.claimable(assetId, bob.address)).to.equal(0);
  });
});
