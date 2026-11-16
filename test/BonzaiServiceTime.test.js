const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  EPOCH_DURATION,
  POOL_THRESHOLDS,
  PROVIDER_LVL1,
  MAX_SESSION_DURATION,
} = require("./helpers/constants");

const PIPELINE_LLM = 0;
const POOL_TEXT = 0;
const PIPELINE_IMAGE = 1;
const POOL_IMAGE = 2;
const PIPELINE_VIDEO = 9;
const POOL_VIDEO = 3;

describe("BonzaiServiceTime (recordServiceTime API)", function () {
  async function deployServiceTimeFixture() {
    const [owner, treasury, provider, consumer] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const bonzai = await MockERC20.deploy("BONZAI", "BONZAI");

    const BonzaiMintPool = await ethers.getContractFactory("BonzaiMintPool");
    const mintPool = await BonzaiMintPool.deploy(
      await bonzai.getAddress(),
      POOL_THRESHOLDS,
      EPOCH_DURATION,
      treasury.address,
    );
    await time.increaseTo(await mintPool.genesisTime());

    const BonzaiStakingVault = await ethers.getContractFactory("BonzaiStakingVault");
    const stakingVault = await BonzaiStakingVault.deploy(
      await bonzai.getAddress(),
      POOL_THRESHOLDS.map((value) => ethers.parseEther(String(value))),
    );
    await mintPool.setStakingVault(await stakingVault.getAddress());

    const BonzaiServiceTime = await ethers.getContractFactory("BonzaiServiceTime");
    const serviceTime = await BonzaiServiceTime.deploy(
      await bonzai.getAddress(),
      await mintPool.getAddress(),
    );
    await mintPool.setServiceTimeContract(await serviceTime.getAddress());

    // Provider stakes LVL1 BONZAI by default.
    await bonzai.mint(provider.address, PROVIDER_LVL1);
    await bonzai.connect(provider).approve(await stakingVault.getAddress(), PROVIDER_LVL1);
    await stakingVault.connect(provider).stake(PROVIDER_LVL1, 0);

    // Pre-fund the provider side of pool 0
    await mintPool.setContentContract(treasury.address);
    await mintPool.connect(treasury).depositForPool(POOL_TEXT, { value: ethers.parseEther("1") });

    return { serviceTime, mintPool, stakingVault, bonzai, owner, treasury, provider, consumer };
  }

  async function verified(f, pipelineId = 0, secondsServed = 600, receipt = ethers.id("receipt-1")) {
    await f.serviceTime.setServiceTimeAttestor(f.owner.address);
    return f.serviceTime.recordVerifiedServiceTime(f.provider.address, pipelineId, secondsServed, await f.mintPool.currentEpoch(), receipt);
  }

  it("starts fail-closed and rejects unsigned single and batch reports even from stakers", async function () {
    const f = await loadFixture(deployServiceTimeFixture);
    expect(await f.serviceTime.claimsPaused()).to.equal(true);
    await expect(f.serviceTime.connect(f.provider).recordServiceTime(0, 86400)).to.be.revertedWithCustomError(f.serviceTime, "UnverifiedServiceTime");
    await expect(f.serviceTime.connect(f.provider).recordServiceTimeBatch([{pipelineId:0,secondsServed:86400}])).to.be.revertedWithCustomError(f.serviceTime, "UnverifiedServiceTime");
    await expect(f.serviceTime.setClaimsPaused(false)).to.be.revertedWith("Attestor required");
    expect(await f.serviceTime.totalServiceTime(0,0)).to.equal(0);
  });

  it("only accepts unique receipts from the explicitly trusted attestor", async function () {
    const f = await loadFixture(deployServiceTimeFixture);
    await f.serviceTime.setServiceTimeAttestor(f.owner.address);
    const receipt = ethers.id("independently-validated-work");
    await expect(f.serviceTime.connect(f.provider).recordVerifiedServiceTime(f.provider.address,0,600,0,receipt))
      .to.be.revertedWithCustomError(f.serviceTime,"UnauthorizedAttestor");
    await expect(f.serviceTime.recordVerifiedServiceTime(f.provider.address,0,600,0,receipt))
      .to.emit(f.serviceTime,"ServiceTimeRecorded").withArgs(f.provider.address,0,0,600,0);
    await expect(f.serviceTime.recordVerifiedServiceTime(f.provider.address,1,600,0,receipt))
      .to.be.revertedWithCustomError(f.serviceTime,"InvalidReceipt");
    expect(await f.serviceTime.totalServiceTime(0,0)).to.equal(600);
  });

  it("rejects missing evidence, invalid durations, pipelines, and finalized receipt epochs", async function () {
    const f = await loadFixture(deployServiceTimeFixture);
    await f.serviceTime.setServiceTimeAttestor(f.owner.address);
    await expect(f.serviceTime.recordVerifiedServiceTime(f.provider.address,0,600,0,ethers.ZeroHash)).to.be.revertedWithCustomError(f.serviceTime,"InvalidReceipt");
    for (const duration of [0, 86401]) {
      await expect(f.serviceTime.recordVerifiedServiceTime(f.provider.address,0,duration,0,ethers.id("bad"))).to.be.revertedWithCustomError(f.serviceTime,"InvalidDuration");
    }
    await expect(f.serviceTime.recordVerifiedServiceTime(f.provider.address,99,60,0,ethers.id("bad"))).to.be.revertedWithCustomError(f.serviceTime,"InvalidPipeline");
    await time.increase(EPOCH_DURATION);
    await expect(f.serviceTime.recordVerifiedServiceTime(f.provider.address,0,60,0,ethers.id("late"))).to.be.revertedWith("Invalid receipt epoch");
  });

  it("requires stake to earn new rewards but preserves previously earned rewards after unstaking", async function () {
    const f = await loadFixture(deployServiceTimeFixture);
    await verified(f);
    await f.serviceTime.setClaimsPaused(false);
    await f.stakingVault.connect(f.provider).unstake(PROVIDER_LVL1);
    await expect(verified(f, 0, 60, ethers.id("other"))).to.be.revertedWithCustomError(f.serviceTime,"ProviderBelowLvl1");
    await time.increase(EPOCH_DURATION);
    await f.serviceTime.pause();
    await f.mintPool.pause();
    await expect(f.serviceTime.connect(f.provider).claimProviderRewards(0,0)).to.changeEtherBalance(f.provider, ethers.parseEther("0.5"));
  });

  it("pays validated work exactly once after epoch finalization", async function () {
    const f = await loadFixture(deployServiceTimeFixture);
    await verified(f);
    await f.serviceTime.setClaimsPaused(false);
    await expect(f.serviceTime.connect(f.provider).claimProviderRewards(0,0)).to.be.revertedWithCustomError(f.serviceTime,"EpochNotFinalized");
    await time.increase(EPOCH_DURATION);
    const expected = (await f.mintPool.getEpochProviderDeposits(0))[0];
    await expect(f.serviceTime.connect(f.provider).claimProviderRewards(0,0)).to.changeEtherBalance(f.provider,expected);
    await expect(f.serviceTime.connect(f.provider).claimProviderRewards(0,0)).to.be.revertedWithCustomError(f.serviceTime,"AlreadyClaimed");
  });

  it("halts claims when the attestor is removed and protects configuration", async function () {
    const f = await loadFixture(deployServiceTimeFixture);
    await verified(f);
    await f.serviceTime.setClaimsPaused(false);
    await expect(f.serviceTime.connect(f.provider).setServiceTimeAttestor(f.provider.address)).to.be.revertedWithCustomError(f.serviceTime,"OwnableUnauthorizedAccount");
    await f.serviceTime.setServiceTimeAttestor(ethers.ZeroAddress);
    expect(await f.serviceTime.claimsPaused()).to.equal(true);
    await time.increase(EPOCH_DURATION);
    await expect(f.serviceTime.connect(f.provider).claimProviderRewards(0,0)).to.be.revertedWithCustomError(f.serviceTime,"ClaimsPaused");
  });

  it("maps supported pipelines and updates the provider registry after payment", async function () {
    const f = await loadFixture(deployServiceTimeFixture);
    for (const [pipeline,pool] of [[0,0],[1,2],[5,1],[9,3],[10,2],[11,0]]) expect(await f.serviceTime.pipelineToPool(pipeline)).to.equal(pool);
    const Registry = await ethers.getContractFactory("BonzaiProviderRegistry");
    const registry = await Registry.deploy(f.treasury.address);
    await registry.setPaymentContract(await f.serviceTime.getAddress());
    await f.serviceTime.setProviderRegistry(await registry.getAddress());
    await registry.connect(f.provider).register("test-peer",["/ip4/127.0.0.1/tcp/4002"],[0],false);
    await verified(f);
    await f.serviceTime.setClaimsPaused(false);
    await time.increase(EPOCH_DURATION);
    await f.serviceTime.connect(f.provider).claimProviderRewards(0,0);
    expect((await registry.getProvider(f.provider.address)).completedJobs).to.equal(1);
  });
  it("rolls only unearned provider allocations without duplicating deposits or erasing earned claims",async()=>{
    const f=await loadFixture(deployServiceTimeFixture);
    await verified(f);await time.increase(EPOCH_DURATION);
    await expect(f.mintPool.rollEmptyAllocation(0,0,true)).to.be.revertedWith('Providers earned rewards');
    await f.mintPool.connect(f.treasury).depositForPool(0,{value:ethers.parseEther('2')});
    const totals=await f.mintPool.getAllTotalDeposited();
    await time.increase(EPOCH_DURATION);
    await f.mintPool.connect(f.consumer).rollEmptyAllocation(1,0,true);
    expect((await f.mintPool.getEpochProviderDeposits(1))[0]).to.equal(0);
    expect((await f.mintPool.getEpochProviderDeposits(2))[0]).to.equal(ethers.parseEther('1'));
    expect(await f.mintPool.getAllTotalDeposited()).to.deep.equal(totals);
    await expect(f.mintPool.rollEmptyAllocation(1,0,true)).to.be.revertedWith('No unearned allocation');
    await f.serviceTime.setClaimsPaused(false);
    await expect(f.serviceTime.connect(f.provider).claimProviderRewards(0,0)).to.changeEtherBalance(f.provider,ethers.parseEther('0.5'));
  });

});
