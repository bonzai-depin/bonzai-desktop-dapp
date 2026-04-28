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

    const BonzaiServiceTime = await ethers.getContractFactory("BonzaiServiceTime");
    const serviceTime = await BonzaiServiceTime.deploy(
      await bonzai.getAddress(),
      await mintPool.getAddress(),
    );
    await mintPool.setServiceTimeContract(await serviceTime.getAddress());

    // Provider holds LVL1 BONZAI by default
    await bonzai.mint(provider.address, PROVIDER_LVL1);

    // Pre-fund the provider side of pool 0
    await mintPool.setContentContract(treasury.address);
    await mintPool.connect(treasury).depositForPool(POOL_TEXT, { value: ethers.parseEther("1") });

    return { serviceTime, mintPool, bonzai, owner, treasury, provider, consumer };
  }

  describe("Deployment", function () {
    it("sets bonzai + mintPool", async function () {
      const { serviceTime, bonzai, mintPool } = await loadFixture(deployServiceTimeFixture);
      expect(await serviceTime.bonzaiToken()).to.equal(await bonzai.getAddress());
      expect(await serviceTime.mintPool()).to.equal(await mintPool.getAddress());
    });

    it("LVL1_THRESHOLD is 1000 BONZAI", async function () {
      const { serviceTime } = await loadFixture(deployServiceTimeFixture);
      expect(await serviceTime.LVL1_THRESHOLD()).to.equal(PROVIDER_LVL1);
    });

    it("MAX_RECORD_DURATION is 24h", async function () {
      const { serviceTime } = await loadFixture(deployServiceTimeFixture);
      expect(await serviceTime.MAX_RECORD_DURATION()).to.equal(MAX_SESSION_DURATION);
    });

    it("pipelineToPool maps correctly", async function () {
      const { serviceTime } = await loadFixture(deployServiceTimeFixture);
      expect(await serviceTime.pipelineToPool(PIPELINE_LLM)).to.equal(POOL_TEXT);
      expect(await serviceTime.pipelineToPool(PIPELINE_IMAGE)).to.equal(POOL_IMAGE);
      expect(await serviceTime.pipelineToPool(PIPELINE_VIDEO)).to.equal(POOL_VIDEO);
      expect(await serviceTime.pipelineToPool(11)).to.equal(POOL_TEXT);
    });
  });

  describe("recordServiceTime", function () {
    it("records elapsed time and credits provider", async function () {
      const { serviceTime, provider } = await loadFixture(deployServiceTimeFixture);
      await expect(serviceTime.connect(provider).recordServiceTime(PIPELINE_LLM, 600))
        .to.emit(serviceTime, "ServiceTimeRecorded")
        .withArgs(provider.address, POOL_TEXT, 0, 600, PIPELINE_LLM);
      expect(await serviceTime.providerServiceTime(0, POOL_TEXT, provider.address)).to.equal(600);
      expect(await serviceTime.totalServiceTime(0, POOL_TEXT)).to.equal(600);
    });

    it("rejects when provider holds < LVL1", async function () {
      const { serviceTime, bonzai, provider } = await loadFixture(deployServiceTimeFixture);
      await bonzai.connect(provider).transfer("0x000000000000000000000000000000000000dEaD", PROVIDER_LVL1);
      await expect(serviceTime.connect(provider).recordServiceTime(PIPELINE_LLM, 60))
        .to.be.revertedWithCustomError(serviceTime, "ProviderBelowLvl1");
    });

    it("rejects 0 duration", async function () {
      const { serviceTime, provider } = await loadFixture(deployServiceTimeFixture);
      await expect(serviceTime.connect(provider).recordServiceTime(PIPELINE_LLM, 0))
        .to.be.revertedWithCustomError(serviceTime, "InvalidDuration");
    });

    it("rejects duration > MAX_RECORD_DURATION", async function () {
      const { serviceTime, provider } = await loadFixture(deployServiceTimeFixture);
      await expect(serviceTime.connect(provider).recordServiceTime(PIPELINE_LLM, MAX_SESSION_DURATION + 1))
        .to.be.revertedWithCustomError(serviceTime, "InvalidDuration");
    });

    it("rejects invalid pipelineId", async function () {
      const { serviceTime, provider } = await loadFixture(deployServiceTimeFixture);
      await expect(serviceTime.connect(provider).recordServiceTime(99, 60))
        .to.be.revertedWithCustomError(serviceTime, "InvalidPipeline");
    });

    it("multiple records accumulate", async function () {
      const { serviceTime, provider } = await loadFixture(deployServiceTimeFixture);
      await serviceTime.connect(provider).recordServiceTime(PIPELINE_LLM, 100);
      await serviceTime.connect(provider).recordServiceTime(PIPELINE_LLM, 200);
      expect(await serviceTime.providerServiceTime(0, POOL_TEXT, provider.address)).to.equal(300);
    });
  });

  describe("recordServiceTimeBatch", function () {
    it("records multiple entries in one tx", async function () {
      const { serviceTime, provider } = await loadFixture(deployServiceTimeFixture);
      const records = [
        { pipelineId: 0, secondsServed: 100 },
        { pipelineId: 1, secondsServed: 200 },
        { pipelineId: 9, secondsServed: 300 },
      ];
      await serviceTime.connect(provider).recordServiceTimeBatch(records);
      expect(await serviceTime.providerServiceTime(0, POOL_TEXT, provider.address)).to.equal(100);
      expect(await serviceTime.providerServiceTime(0, POOL_IMAGE, provider.address)).to.equal(200);
      expect(await serviceTime.providerServiceTime(0, POOL_VIDEO, provider.address)).to.equal(300);
    });

    it("rejects empty batch", async function () {
      const { serviceTime, provider } = await loadFixture(deployServiceTimeFixture);
      await expect(serviceTime.connect(provider).recordServiceTimeBatch([]))
        .to.be.revertedWith("Empty batch");
    });

    it("checks LVL1 once for the whole batch", async function () {
      const { serviceTime, bonzai, provider } = await loadFixture(deployServiceTimeFixture);
      await bonzai.connect(provider).transfer("0x000000000000000000000000000000000000dEaD", PROVIDER_LVL1);
      await expect(serviceTime.connect(provider).recordServiceTimeBatch([{ pipelineId: 0, secondsServed: 60 }]))
        .to.be.revertedWithCustomError(serviceTime, "ProviderBelowLvl1");
    });
  });

  describe("claimProviderRewards", function () {
    it("transfers weighted share of pool", async function () {
      const { serviceTime, mintPool, provider } = await loadFixture(deployServiceTimeFixture);
      await serviceTime.connect(provider).recordServiceTime(PIPELINE_LLM, 600);
      await time.increase(EPOCH_DURATION);

      const providerArr = await mintPool.getEpochProviderDeposits(0);
      const expected = providerArr[POOL_TEXT];
      await expect(serviceTime.connect(provider).claimProviderRewards(0, POOL_TEXT))
        .to.changeEtherBalance(provider, expected);
    });

    it("emits ProviderRewardsClaimed with paidAmount", async function () {
      const { serviceTime, provider } = await loadFixture(deployServiceTimeFixture);
      await serviceTime.connect(provider).recordServiceTime(PIPELINE_LLM, 600);
      await time.increase(EPOCH_DURATION);
      await expect(serviceTime.connect(provider).claimProviderRewards(0, POOL_TEXT))
        .to.emit(serviceTime, "ProviderRewardsClaimed");
    });

    it("rejects double claim", async function () {
      const { serviceTime, provider } = await loadFixture(deployServiceTimeFixture);
      await serviceTime.connect(provider).recordServiceTime(PIPELINE_LLM, 600);
      await time.increase(EPOCH_DURATION);
      await serviceTime.connect(provider).claimProviderRewards(0, POOL_TEXT);
      await expect(serviceTime.connect(provider).claimProviderRewards(0, POOL_TEXT))
        .to.be.revertedWithCustomError(serviceTime, "AlreadyClaimed");
    });

    it("rejects when epoch not finalized", async function () {
      const { serviceTime, provider } = await loadFixture(deployServiceTimeFixture);
      await serviceTime.connect(provider).recordServiceTime(PIPELINE_LLM, 60);
      await expect(serviceTime.connect(provider).claimProviderRewards(0, POOL_TEXT))
        .to.be.revertedWithCustomError(serviceTime, "EpochNotFinalized");
    });

    it("rejects when no service time recorded", async function () {
      const { serviceTime, provider } = await loadFixture(deployServiceTimeFixture);
      await time.increase(EPOCH_DURATION);
      await expect(serviceTime.connect(provider).claimProviderRewards(0, POOL_TEXT))
        .to.be.revertedWithCustomError(serviceTime, "NoServiceTime");
    });

    it("rejects when claims paused", async function () {
      const { serviceTime, owner, provider } = await loadFixture(deployServiceTimeFixture);
      await serviceTime.connect(provider).recordServiceTime(PIPELINE_LLM, 60);
      await time.increase(EPOCH_DURATION);
      await serviceTime.connect(owner).setClaimsPaused(true);
      await expect(serviceTime.connect(provider).claimProviderRewards(0, POOL_TEXT))
        .to.be.revertedWithCustomError(serviceTime, "ClaimsPaused");
      await serviceTime.connect(owner).setClaimsPaused(false);
      await expect(serviceTime.connect(provider).claimProviderRewards(0, POOL_TEXT))
        .to.not.be.reverted;
    });

    it("provider can still record while claims are paused", async function () {
      const { serviceTime, owner, provider } = await loadFixture(deployServiceTimeFixture);
      await serviceTime.connect(owner).setClaimsPaused(true);
      await expect(serviceTime.connect(provider).recordServiceTime(PIPELINE_LLM, 60))
        .to.not.be.reverted;
    });
  });

  describe("ProviderRegistry wiring", function () {
    it("recordEarnings is called when claim succeeds", async function () {
      const { serviceTime, owner, provider } = await loadFixture(deployServiceTimeFixture);
      const BonzaiProviderRegistry = await ethers.getContractFactory("BonzaiProviderRegistry");
      const registry = await BonzaiProviderRegistry.deploy(owner.address);
      await registry.setPaymentContract(await serviceTime.getAddress());
      await serviceTime.connect(owner).setProviderRegistry(await registry.getAddress());

      await registry.connect(provider).register("12D3KooWTestPeer", ["/ip4/127.0.0.1/tcp/4002"], [0], false);

      await serviceTime.connect(provider).recordServiceTime(PIPELINE_LLM, 60);
      await time.increase(EPOCH_DURATION);
      await serviceTime.connect(provider).claimProviderRewards(0, POOL_TEXT);

      const p = await registry.getProvider(provider.address);
      expect(p.completedJobs).to.equal(1);
      expect(p.totalEarnings).to.be.gt(0);
    });
  });
});
