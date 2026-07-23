const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BonzAI staking-centered utility economy", function () {
  async function deployFixture() {
    const [owner, alice, bob, treasury, payer] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const bonzai = await MockERC20.deploy("BONZAI", "BONZAI");

    const thresholds = [1000, 5000, 10000, 25000, 50000, 100000]
      .map(value => ethers.parseEther(String(value)));

    const StakingVault = await ethers.getContractFactory("BonzaiStakingVault");
    const stakingVault = await StakingVault.deploy(await bonzai.getAddress(), thresholds);

    const RevenueRouter = await ethers.getContractFactory("BonzaiRevenueRouter");
    const revenueRouter = await RevenueRouter.deploy(await stakingVault.getAddress(), treasury.address);

    await bonzai.mint(alice.address, ethers.parseEther("10000"));
    await bonzai.mint(bob.address, ethers.parseEther("10000"));
    await bonzai.connect(alice).approve(await stakingVault.getAddress(), ethers.MaxUint256);
    await bonzai.connect(bob).approve(await stakingVault.getAddress(), ethers.MaxUint256);

    return { owner, alice, bob, treasury, payer, bonzai, stakingVault, revenueRouter };
  }

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
