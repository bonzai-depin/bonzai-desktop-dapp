const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployProviderRegistry } = require("./helpers/deploy");
const { PLATFORM_FEE_BPS, MIN_STAKE } = require("./helpers/constants");

describe("BonzaiProviderRegistry", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  const PEER_ID_1 = "12D3KooWTestPeerId1";
  const PEER_ID_2 = "12D3KooWTestPeerId2";
  const PEER_ID_3 = "12D3KooWTestPeerId3";
  const MULTIADDRS = ["/ip4/127.0.0.1/tcp/4001"];
  const MULTIADDRS_2 = ["/ip4/192.168.1.1/tcp/4001", "/ip4/10.0.0.1/tcp/4002"];
  const PIPELINES_LLM_IMAGE = [0, 1, 9]; // LLM, IMAGE_TURBO, VIDEO_FAST
  const PIPELINES_AUDIO = [6, 7, 8]; // AUDIO_TURBO, AUDIO_QUALITY, MUSIC
  const PRICE_PER_TOKEN = 1000;
  const PRICE_PER_TOKEN_2 = 2000;

  /**
   * Helper: register provider1 with default parameters
   */
  async function registerProvider1(registry, provider1) {
    return registry.connect(provider1).register(
      PEER_ID_1,
      MULTIADDRS,
      PIPELINES_LLM_IMAGE,
      PRICE_PER_TOKEN,
      false,
      { value: MIN_STAKE }
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      const { registry, owner } = await loadFixture(deployProviderRegistry);
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("should set the correct treasury", async function () {
      const { registry, treasury } = await loadFixture(deployProviderRegistry);
      expect(await registry.treasury()).to.equal(treasury.address);
    });

    it("should set the correct minStakeAmount", async function () {
      const { registry } = await loadFixture(deployProviderRegistry);
      expect(await registry.minStakeAmount()).to.equal(MIN_STAKE);
    });

    it("should set the correct platformFeeBps", async function () {
      const { registry } = await loadFixture(deployProviderRegistry);
      expect(await registry.platformFeeBps()).to.equal(PLATFORM_FEE_BPS);
    });

    it("should initialize with zero providers", async function () {
      const { registry } = await loadFixture(deployProviderRegistry);
      expect(await registry.getProviderCount()).to.equal(0);
    });

    it("should initialize with zero active providers", async function () {
      const { registry } = await loadFixture(deployProviderRegistry);
      expect(await registry.getActiveProviderCount()).to.equal(0);
    });

    it("should initialize paymentContract as zero address", async function () {
      const { registry } = await loadFixture(deployProviderRegistry);
      expect(await registry.paymentContract()).to.equal(ethers.ZeroAddress);
    });

    it("should set MAX_PIPELINE_CATEGORY to 11 (PIPELINE_SHARD)", async function () {
      const { registry } = await loadFixture(deployProviderRegistry);
      expect(await registry.MAX_PIPELINE_CATEGORY()).to.equal(11);
    });

    it("should revert when treasury is zero address", async function () {
      const BonzaiProviderRegistry = await ethers.getContractFactory("BonzaiProviderRegistry");
      await expect(
        BonzaiProviderRegistry.deploy(ethers.ZeroAddress, MIN_STAKE, PLATFORM_FEE_BPS)
      ).to.be.revertedWithCustomError(BonzaiProviderRegistry, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Registration", function () {
    it("should register a provider with valid data", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      const provider = await registry.getProvider(provider1.address);
      expect(provider.wallet).to.equal(provider1.address);
      expect(provider.peerId).to.equal(PEER_ID_1);
      expect(provider.multiaddrs[0]).to.equal(MULTIADDRS[0]);
      expect(provider.pipelines.length).to.equal(3);
      expect(provider.pipelines[0]).to.equal(0);
      expect(provider.pipelines[1]).to.equal(1);
      expect(provider.pipelines[2]).to.equal(9);
      expect(provider.pricePerToken).to.equal(PRICE_PER_TOKEN);
      expect(provider.stakedAmount).to.equal(MIN_STAKE);
      expect(provider.totalEarnings).to.equal(0);
      expect(provider.completedJobs).to.equal(0);
      expect(provider.isActive).to.be.true;
      expect(provider.isRelay).to.be.false;
    });

    it("should set registeredAt and lastSeenAt to current block timestamp", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      const tx = await registerProvider1(registry, provider1);
      const block = await ethers.provider.getBlock(tx.blockNumber);

      const provider = await registry.getProvider(provider1.address);
      expect(provider.registeredAt).to.equal(block.timestamp);
      expect(provider.lastSeenAt).to.equal(block.timestamp);
    });

    it("should map peerId to provider wallet", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      expect(await registry.peerIdToWallet(PEER_ID_1)).to.equal(provider1.address);
    });

    it("should increment provider count", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      expect(await registry.getProviderCount()).to.equal(1);
    });

    it("should increment active provider count", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      expect(await registry.getActiveProviderCount()).to.equal(1);
    });

    it("should register a relay provider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(
        PEER_ID_1, MULTIADDRS, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, true,
        { value: MIN_STAKE }
      );

      const provider = await registry.getProvider(provider1.address);
      expect(provider.isRelay).to.be.true;
    });

    it("should register multiple providers", async function () {
      const { registry, provider1, provider2, provider3 } = await loadFixture(deployProviderRegistry);

      await registerProvider1(registry, provider1);
      await registry.connect(provider2).register(
        PEER_ID_2, MULTIADDRS_2, PIPELINES_AUDIO, PRICE_PER_TOKEN_2, false,
        { value: MIN_STAKE }
      );
      await registry.connect(provider3).register(
        PEER_ID_3, MULTIADDRS, [0], 500, true,
        { value: MIN_STAKE }
      );

      expect(await registry.getProviderCount()).to.equal(3);
      expect(await registry.getActiveProviderCount()).to.equal(3);
    });

    it("should allow staking more than the minimum", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      const extraStake = ethers.parseEther("1.0");
      await registry.connect(provider1).register(
        PEER_ID_1, MULTIADDRS, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, false,
        { value: extraStake }
      );

      const provider = await registry.getProvider(provider1.address);
      expect(provider.stakedAmount).to.equal(extraStake);
    });

    it("should revert with EmptyPeerId when peerId is empty", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(
        registry.connect(provider1).register(
          "", MULTIADDRS, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, false,
          { value: MIN_STAKE }
        )
      ).to.be.revertedWithCustomError(registry, "EmptyPeerId");
    });

    it("should revert with NoPipelines when pipelines array is empty", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(
        registry.connect(provider1).register(
          PEER_ID_1, MULTIADDRS, [], PRICE_PER_TOKEN, false,
          { value: MIN_STAKE }
        )
      ).to.be.revertedWithCustomError(registry, "NoPipelines");
    });

    it("should revert with ZeroPrice when pricePerToken is zero", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(
        registry.connect(provider1).register(
          PEER_ID_1, MULTIADDRS, PIPELINES_LLM_IMAGE, 0, false,
          { value: MIN_STAKE }
        )
      ).to.be.revertedWithCustomError(registry, "ZeroPrice");
    });

    it("should revert with PeerIdTaken when peerId is already registered by another provider", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await expect(
        registry.connect(provider2).register(
          PEER_ID_1, MULTIADDRS, PIPELINES_AUDIO, PRICE_PER_TOKEN_2, false,
          { value: MIN_STAKE }
        )
      ).to.be.revertedWithCustomError(registry, "PeerIdTaken")
        .withArgs(PEER_ID_1);
    });

    it("should allow the same provider to re-register with the same peerId", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      // Re-register same provider with same peerId (update via register)
      await registry.connect(provider1).register(
        PEER_ID_1, MULTIADDRS_2, PIPELINES_AUDIO, PRICE_PER_TOKEN_2, true,
        { value: MIN_STAKE }
      );

      const provider = await registry.getProvider(provider1.address);
      expect(provider.peerId).to.equal(PEER_ID_1);
      expect(provider.pricePerToken).to.equal(PRICE_PER_TOKEN_2);
      expect(provider.isRelay).to.be.true;
      // Stake should be cumulative
      expect(provider.stakedAmount).to.equal(MIN_STAKE * 2n);
    });

    it("should not duplicate providerAddresses on re-register", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider1).register(
        PEER_ID_1, MULTIADDRS, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, false,
        { value: MIN_STAKE }
      );

      expect(await registry.getProviderCount()).to.equal(1);
    });

    it("should allow registration with empty multiaddrs", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(
        PEER_ID_1, [], PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, false,
        { value: MIN_STAKE }
      );

      const provider = await registry.getProvider(provider1.address);
      expect(provider.multiaddrs.length).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. PIPELINE VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Pipeline Validation", function () {
    it("should accept pipeline category 0 (LLM)", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(
        PEER_ID_1, MULTIADDRS, [0], PRICE_PER_TOKEN, false,
        { value: MIN_STAKE }
      );

      const provider = await registry.getProvider(provider1.address);
      expect(provider.pipelines[0]).to.equal(0);
    });

    it("should accept pipeline category 10 (VISION, the max)", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(
        PEER_ID_1, MULTIADDRS, [10], PRICE_PER_TOKEN, false,
        { value: MIN_STAKE }
      );

      const provider = await registry.getProvider(provider1.address);
      expect(provider.pipelines[0]).to.equal(10);
    });

    it("should accept all valid pipeline categories (0-10)", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      const allPipelines = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      await registry.connect(provider1).register(
        PEER_ID_1, MULTIADDRS, allPipelines, PRICE_PER_TOKEN, false,
        { value: MIN_STAKE }
      );

      const provider = await registry.getProvider(provider1.address);
      expect(provider.pipelines.length).to.equal(11);
    });

    it("should revert with InvalidPipelineCategory when category is 12", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(
        registry.connect(provider1).register(
          PEER_ID_1, MULTIADDRS, [12], PRICE_PER_TOKEN, false,
          { value: MIN_STAKE }
        )
      ).to.be.revertedWithCustomError(registry, "InvalidPipelineCategory")
        .withArgs(12, 11);
    });

    it("should revert with InvalidPipelineCategory when category is 255", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(
        registry.connect(provider1).register(
          PEER_ID_1, MULTIADDRS, [255], PRICE_PER_TOKEN, false,
          { value: MIN_STAKE }
        )
      ).to.be.revertedWithCustomError(registry, "InvalidPipelineCategory")
        .withArgs(255, 11);
    });

    it("should revert when any pipeline in the array is invalid", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      // Valid pipelines except the last one
      await expect(
        registry.connect(provider1).register(
          PEER_ID_1, MULTIADDRS, [0, 1, 50], PRICE_PER_TOKEN, false,
          { value: MIN_STAKE }
        )
      ).to.be.revertedWithCustomError(registry, "InvalidPipelineCategory")
        .withArgs(50, 11);
    });

    it("should revert with InvalidPipelineCategory on updateProvider with invalid pipeline", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await expect(
        registry.connect(provider1).updateProvider(
          PEER_ID_1, MULTIADDRS, [0, 12], PRICE_PER_TOKEN, false
        )
      ).to.be.revertedWithCustomError(registry, "InvalidPipelineCategory")
        .withArgs(12, 11);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. STAKING
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Staking", function () {
    it("should revert with InsufficientStake when sending less than minimum", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      const tooLittle = ethers.parseEther("0.05");
      await expect(
        registry.connect(provider1).register(
          PEER_ID_1, MULTIADDRS, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, false,
          { value: tooLittle }
        )
      ).to.be.revertedWithCustomError(registry, "InsufficientStake")
        .withArgs(tooLittle, MIN_STAKE);
    });

    it("should revert with InsufficientStake when sending zero ETH", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(
        registry.connect(provider1).register(
          PEER_ID_1, MULTIADDRS, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, false,
          { value: 0 }
        )
      ).to.be.revertedWithCustomError(registry, "InsufficientStake")
        .withArgs(0, MIN_STAKE);
    });

    it("should accept exact minimum stake", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      const provider = await registry.getProvider(provider1.address);
      expect(provider.stakedAmount).to.equal(MIN_STAKE);
    });

    it("should accumulate stake on re-registration", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider1).register(
        PEER_ID_1, MULTIADDRS, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, false,
        { value: MIN_STAKE }
      );

      const provider = await registry.getProvider(provider1.address);
      expect(provider.stakedAmount).to.equal(MIN_STAKE * 2n);
    });

    it("should allow registration without stake when minStakeAmount is zero", async function () {
      const { registry, owner, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(owner).setMinStake(0);

      await registry.connect(provider1).register(
        PEER_ID_1, MULTIADDRS, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, false,
        { value: 0 }
      );

      const provider = await registry.getProvider(provider1.address);
      expect(provider.wallet).to.equal(provider1.address);
      expect(provider.stakedAmount).to.equal(0);
    });

    it("should hold the staked ETH in the contract", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      const registryAddress = await registry.getAddress();
      const balanceBefore = await ethers.provider.getBalance(registryAddress);

      await registerProvider1(registry, provider1);

      const balanceAfter = await ethers.provider.getBalance(registryAddress);
      expect(balanceAfter - balanceBefore).to.equal(MIN_STAKE);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. UPDATE PROVIDER
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Update Provider", function () {
    it("should update provider details via updateProvider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await registry.connect(provider1).updateProvider(
        PEER_ID_2, MULTIADDRS_2, PIPELINES_AUDIO, PRICE_PER_TOKEN_2, true
      );

      const provider = await registry.getProvider(provider1.address);
      expect(provider.peerId).to.equal(PEER_ID_2);
      expect(provider.multiaddrs.length).to.equal(2);
      expect(provider.multiaddrs[0]).to.equal(MULTIADDRS_2[0]);
      expect(provider.multiaddrs[1]).to.equal(MULTIADDRS_2[1]);
      expect(provider.pipelines.length).to.equal(3);
      expect(provider.pipelines[0]).to.equal(6);
      expect(provider.pricePerToken).to.equal(PRICE_PER_TOKEN_2);
      expect(provider.isRelay).to.be.true;
    });

    it("should clear old peerId mapping when peerId changes", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      // Verify old mapping exists
      expect(await registry.peerIdToWallet(PEER_ID_1)).to.equal(provider1.address);

      // Update with new peerId
      await registry.connect(provider1).updateProvider(
        PEER_ID_2, MULTIADDRS, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, false
      );

      // Old peerId should be cleared
      expect(await registry.peerIdToWallet(PEER_ID_1)).to.equal(ethers.ZeroAddress);
      // New peerId should be mapped
      expect(await registry.peerIdToWallet(PEER_ID_2)).to.equal(provider1.address);
    });

    it("should keep peerId mapping when peerId does not change", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await registry.connect(provider1).updateProvider(
        PEER_ID_1, MULTIADDRS_2, PIPELINES_AUDIO, PRICE_PER_TOKEN_2, true
      );

      expect(await registry.peerIdToWallet(PEER_ID_1)).to.equal(provider1.address);
    });

    it("should preserve stakedAmount after update", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await registry.connect(provider1).updateProvider(
        PEER_ID_2, MULTIADDRS, PIPELINES_AUDIO, PRICE_PER_TOKEN_2, false
      );

      const provider = await registry.getProvider(provider1.address);
      expect(provider.stakedAmount).to.equal(MIN_STAKE);
    });

    it("should preserve registeredAt after update", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      const regTx = await registerProvider1(registry, provider1);
      const regBlock = await ethers.provider.getBlock(regTx.blockNumber);

      await registry.connect(provider1).updateProvider(
        PEER_ID_2, MULTIADDRS, PIPELINES_AUDIO, PRICE_PER_TOKEN_2, false
      );

      const provider = await registry.getProvider(provider1.address);
      expect(provider.registeredAt).to.equal(regBlock.timestamp);
    });

    it("should update lastSeenAt on updateProvider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      const updateTx = await registry.connect(provider1).updateProvider(
        PEER_ID_2, MULTIADDRS, PIPELINES_AUDIO, PRICE_PER_TOKEN_2, false
      );
      const updateBlock = await ethers.provider.getBlock(updateTx.blockNumber);

      const provider = await registry.getProvider(provider1.address);
      expect(provider.lastSeenAt).to.equal(updateBlock.timestamp);
    });

    it("should also update via register() for existing provider (clear old peerId)", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      // Re-register with different peerId
      await registry.connect(provider1).register(
        PEER_ID_2, MULTIADDRS_2, PIPELINES_AUDIO, PRICE_PER_TOKEN_2, true,
        { value: MIN_STAKE }
      );

      // Old peerId should be cleared
      expect(await registry.peerIdToWallet(PEER_ID_1)).to.equal(ethers.ZeroAddress);
      // New peerId should be mapped
      expect(await registry.peerIdToWallet(PEER_ID_2)).to.equal(provider1.address);
    });

    it("should revert with NotRegistered if provider is not registered", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(
        registry.connect(provider1).updateProvider(
          PEER_ID_1, MULTIADDRS, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, false
        )
      ).to.be.revertedWithCustomError(registry, "NotRegistered");
    });

    it("should revert with EmptyPeerId on updateProvider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await expect(
        registry.connect(provider1).updateProvider(
          "", MULTIADDRS, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, false
        )
      ).to.be.revertedWithCustomError(registry, "EmptyPeerId");
    });

    it("should revert with NoPipelines on updateProvider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await expect(
        registry.connect(provider1).updateProvider(
          PEER_ID_1, MULTIADDRS, [], PRICE_PER_TOKEN, false
        )
      ).to.be.revertedWithCustomError(registry, "NoPipelines");
    });

    it("should revert with ZeroPrice on updateProvider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await expect(
        registry.connect(provider1).updateProvider(
          PEER_ID_1, MULTIADDRS, PIPELINES_LLM_IMAGE, 0, false
        )
      ).to.be.revertedWithCustomError(registry, "ZeroPrice");
    });

    it("should revert with PeerIdTaken on updateProvider when peerId belongs to another", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider2).register(
        PEER_ID_2, MULTIADDRS, PIPELINES_AUDIO, PRICE_PER_TOKEN_2, false,
        { value: MIN_STAKE }
      );

      await expect(
        registry.connect(provider1).updateProvider(
          PEER_ID_2, MULTIADDRS, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, false
        )
      ).to.be.revertedWithCustomError(registry, "PeerIdTaken")
        .withArgs(PEER_ID_2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. ACTIVATION / DEACTIVATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Activation / Deactivation", function () {
    it("should deactivate a registered provider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await registry.connect(provider1).deactivate();

      const provider = await registry.getProvider(provider1.address);
      expect(provider.isActive).to.be.false;
    });

    it("should clear peerId mapping on deactivation", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await registry.connect(provider1).deactivate();

      expect(await registry.peerIdToWallet(PEER_ID_1)).to.equal(ethers.ZeroAddress);
    });

    it("should decrement active provider count on deactivation", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      expect(await registry.getActiveProviderCount()).to.equal(1);

      await registry.connect(provider1).deactivate();
      expect(await registry.getActiveProviderCount()).to.equal(0);
    });

    it("should not decrement total provider count on deactivation", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await registry.connect(provider1).deactivate();
      expect(await registry.getProviderCount()).to.equal(1);
    });

    it("should reactivate a deactivated provider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider1).deactivate();

      await registry.connect(provider1).activate();

      const provider = await registry.getProvider(provider1.address);
      expect(provider.isActive).to.be.true;
    });

    it("should restore peerId mapping on activation", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider1).deactivate();

      expect(await registry.peerIdToWallet(PEER_ID_1)).to.equal(ethers.ZeroAddress);

      await registry.connect(provider1).activate();

      expect(await registry.peerIdToWallet(PEER_ID_1)).to.equal(provider1.address);
    });

    it("should update lastSeenAt on activation", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider1).deactivate();

      const activateTx = await registry.connect(provider1).activate();
      const block = await ethers.provider.getBlock(activateTx.blockNumber);

      const provider = await registry.getProvider(provider1.address);
      expect(provider.lastSeenAt).to.equal(block.timestamp);
    });

    it("should update lastSeenAt on heartbeat", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      const heartbeatTx = await registry.connect(provider1).heartbeat();
      const block = await ethers.provider.getBlock(heartbeatTx.blockNumber);

      const provider = await registry.getProvider(provider1.address);
      expect(provider.lastSeenAt).to.equal(block.timestamp);
    });

    it("should revert deactivate with NotRegistered for unregistered provider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(
        registry.connect(provider1).deactivate()
      ).to.be.revertedWithCustomError(registry, "NotRegistered");
    });

    it("should revert activate with NotRegistered for unregistered provider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(
        registry.connect(provider1).activate()
      ).to.be.revertedWithCustomError(registry, "NotRegistered");
    });

    it("should revert heartbeat with NotRegistered for unregistered provider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(
        registry.connect(provider1).heartbeat()
      ).to.be.revertedWithCustomError(registry, "NotRegistered");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. RECORD EARNINGS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Record Earnings", function () {
    it("should record earnings from the authorized payment contract", async function () {
      const { registry, owner, provider1, paymentContract } = await loadFixture(deployProviderRegistry);
      await registry.connect(owner).setPaymentContract(paymentContract.address);
      await registerProvider1(registry, provider1);

      const earnings = ethers.parseEther("0.5");
      await registry.connect(paymentContract).recordEarnings(provider1.address, earnings);

      const provider = await registry.getProvider(provider1.address);
      expect(provider.totalEarnings).to.equal(earnings);
      expect(provider.completedJobs).to.equal(1);
    });

    it("should accumulate earnings across multiple jobs", async function () {
      const { registry, owner, provider1, paymentContract } = await loadFixture(deployProviderRegistry);
      await registry.connect(owner).setPaymentContract(paymentContract.address);
      await registerProvider1(registry, provider1);

      const earnings1 = ethers.parseEther("0.3");
      const earnings2 = ethers.parseEther("0.7");
      await registry.connect(paymentContract).recordEarnings(provider1.address, earnings1);
      await registry.connect(paymentContract).recordEarnings(provider1.address, earnings2);

      const provider = await registry.getProvider(provider1.address);
      expect(provider.totalEarnings).to.equal(earnings1 + earnings2);
      expect(provider.completedJobs).to.equal(2);
    });

    it("should update lastSeenAt on earnings recording", async function () {
      const { registry, owner, provider1, paymentContract } = await loadFixture(deployProviderRegistry);
      await registry.connect(owner).setPaymentContract(paymentContract.address);
      await registerProvider1(registry, provider1);

      const tx = await registry.connect(paymentContract).recordEarnings(
        provider1.address, ethers.parseEther("0.1")
      );
      const block = await ethers.provider.getBlock(tx.blockNumber);

      const provider = await registry.getProvider(provider1.address);
      expect(provider.lastSeenAt).to.equal(block.timestamp);
    });

    it("should revert with OnlyPaymentContract when called by non-payment contract", async function () {
      const { registry, owner, provider1, paymentContract } = await loadFixture(deployProviderRegistry);
      await registry.connect(owner).setPaymentContract(paymentContract.address);
      await registerProvider1(registry, provider1);

      await expect(
        registry.connect(provider1).recordEarnings(provider1.address, ethers.parseEther("0.1"))
      ).to.be.revertedWithCustomError(registry, "OnlyPaymentContract");
    });

    it("should revert with OnlyPaymentContract when paymentContract is not set", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await expect(
        registry.connect(provider1).recordEarnings(provider1.address, ethers.parseEther("0.1"))
      ).to.be.revertedWithCustomError(registry, "OnlyPaymentContract");
    });

    it("should revert with ProviderNotRegistered for unregistered provider", async function () {
      const { registry, owner, provider1, provider2, paymentContract } = await loadFixture(deployProviderRegistry);
      await registry.connect(owner).setPaymentContract(paymentContract.address);
      // provider2 is not registered

      await expect(
        registry.connect(paymentContract).recordEarnings(provider2.address, ethers.parseEther("0.1"))
      ).to.be.revertedWithCustomError(registry, "ProviderNotRegistered")
        .withArgs(provider2.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. STAKE WITHDRAWAL
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Stake Withdrawal", function () {
    it("should allow full stake withdrawal after deactivation", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider1).deactivate();

      const balanceBefore = await ethers.provider.getBalance(provider1.address);
      const tx = await registry.connect(provider1).withdrawStake(MIN_STAKE);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(provider1.address);

      expect(balanceAfter - balanceBefore + gasUsed).to.equal(MIN_STAKE);

      const provider = await registry.getProvider(provider1.address);
      expect(provider.stakedAmount).to.equal(0);
    });

    it("should allow partial stake withdrawal", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      const doubleStake = MIN_STAKE * 2n;
      await registry.connect(provider1).register(
        PEER_ID_1, MULTIADDRS, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, false,
        { value: doubleStake }
      );
      await registry.connect(provider1).deactivate();

      await registry.connect(provider1).withdrawStake(MIN_STAKE);

      const provider = await registry.getProvider(provider1.address);
      expect(provider.stakedAmount).to.equal(MIN_STAKE);
    });

    it("should revert with StillActive when provider has not deactivated", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await expect(
        registry.connect(provider1).withdrawStake(MIN_STAKE)
      ).to.be.revertedWithCustomError(registry, "StillActive");
    });

    it("should revert with NotRegistered for unregistered provider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(
        registry.connect(provider1).withdrawStake(MIN_STAKE)
      ).to.be.revertedWithCustomError(registry, "NotRegistered");
    });

    it("should revert with ZeroAmount when amount is zero", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider1).deactivate();

      await expect(
        registry.connect(provider1).withdrawStake(0)
      ).to.be.revertedWithCustomError(registry, "ZeroAmount");
    });

    it("should revert with InsufficientStakeBalance when requesting more than staked", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider1).deactivate();

      const tooMuch = MIN_STAKE + ethers.parseEther("1");
      await expect(
        registry.connect(provider1).withdrawStake(tooMuch)
      ).to.be.revertedWithCustomError(registry, "InsufficientStakeBalance")
        .withArgs(tooMuch, MIN_STAKE);
    });

    it("should reduce contract balance on withdrawal", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider1).deactivate();

      const registryAddress = await registry.getAddress();
      const balanceBefore = await ethers.provider.getBalance(registryAddress);

      await registry.connect(provider1).withdrawStake(MIN_STAKE);

      const balanceAfter = await ethers.provider.getBalance(registryAddress);
      expect(balanceBefore - balanceAfter).to.equal(MIN_STAKE);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. VIEW FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("View Functions", function () {
    it("getProvider should return empty struct for unregistered address", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      const provider = await registry.getProvider(provider1.address);
      expect(provider.wallet).to.equal(ethers.ZeroAddress);
    });

    it("getProvider should return correct data for registered provider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      const provider = await registry.getProvider(provider1.address);
      expect(provider.wallet).to.equal(provider1.address);
      expect(provider.peerId).to.equal(PEER_ID_1);
    });

    it("getProviderByPeerId should return provider data", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      const provider = await registry.getProviderByPeerId(PEER_ID_1);
      expect(provider.wallet).to.equal(provider1.address);
      expect(provider.peerId).to.equal(PEER_ID_1);
      expect(provider.pricePerToken).to.equal(PRICE_PER_TOKEN);
    });

    it("getProviderByPeerId should return empty struct for unknown peerId", async function () {
      const { registry } = await loadFixture(deployProviderRegistry);
      const provider = await registry.getProviderByPeerId("nonexistent");
      expect(provider.wallet).to.equal(ethers.ZeroAddress);
    });

    it("getProvidersForPipeline should return active providers supporting the pipeline", async function () {
      const { registry, provider1, provider2, provider3 } = await loadFixture(deployProviderRegistry);

      // provider1 supports LLM(0), IMAGE_TURBO(1), VIDEO_FAST(9)
      await registerProvider1(registry, provider1);
      // provider2 supports AUDIO_TURBO(6), AUDIO_QUALITY(7), MUSIC(8)
      await registry.connect(provider2).register(
        PEER_ID_2, MULTIADDRS, PIPELINES_AUDIO, PRICE_PER_TOKEN_2, false,
        { value: MIN_STAKE }
      );
      // provider3 supports LLM(0) only
      await registry.connect(provider3).register(
        PEER_ID_3, MULTIADDRS, [0], 500, false,
        { value: MIN_STAKE }
      );

      // LLM should return provider1 and provider3
      const llmProviders = await registry.getProvidersForPipeline(0);
      expect(llmProviders.length).to.equal(2);

      // AUDIO_TURBO should return only provider2
      const audioProviders = await registry.getProvidersForPipeline(6);
      expect(audioProviders.length).to.equal(1);
      expect(audioProviders[0].wallet).to.equal(provider2.address);

      // IMAGE_QUALITY should return none
      const imageQualityProviders = await registry.getProvidersForPipeline(2);
      expect(imageQualityProviders.length).to.equal(0);
    });

    it("getProvidersForPipeline should exclude deactivated providers", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider2).register(
        PEER_ID_2, MULTIADDRS, [0], PRICE_PER_TOKEN, false,
        { value: MIN_STAKE }
      );

      // Deactivate provider1
      await registry.connect(provider1).deactivate();

      const llmProviders = await registry.getProvidersForPipeline(0);
      expect(llmProviders.length).to.equal(1);
      expect(llmProviders[0].wallet).to.equal(provider2.address);
    });

    it("getRelayNodes should return only active relay providers", async function () {
      const { registry, provider1, provider2, provider3 } = await loadFixture(deployProviderRegistry);

      // provider1 is NOT a relay
      await registerProvider1(registry, provider1);
      // provider2 IS a relay
      await registry.connect(provider2).register(
        PEER_ID_2, MULTIADDRS, PIPELINES_AUDIO, PRICE_PER_TOKEN, true,
        { value: MIN_STAKE }
      );
      // provider3 IS a relay
      await registry.connect(provider3).register(
        PEER_ID_3, MULTIADDRS, [0], PRICE_PER_TOKEN, true,
        { value: MIN_STAKE }
      );

      const relays = await registry.getRelayNodes();
      expect(relays.length).to.equal(2);
    });

    it("getRelayNodes should exclude deactivated relays", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployProviderRegistry);

      await registry.connect(provider1).register(
        PEER_ID_1, MULTIADDRS, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, true,
        { value: MIN_STAKE }
      );
      await registry.connect(provider2).register(
        PEER_ID_2, MULTIADDRS, PIPELINES_AUDIO, PRICE_PER_TOKEN, true,
        { value: MIN_STAKE }
      );

      await registry.connect(provider1).deactivate();

      const relays = await registry.getRelayNodes();
      expect(relays.length).to.equal(1);
      expect(relays[0].wallet).to.equal(provider2.address);
    });

    it("getRelayNodes should return empty array when no relays exist", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1); // not a relay

      const relays = await registry.getRelayNodes();
      expect(relays.length).to.equal(0);
    });

    it("getProviderCount should return total providers", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployProviderRegistry);
      expect(await registry.getProviderCount()).to.equal(0);

      await registerProvider1(registry, provider1);
      expect(await registry.getProviderCount()).to.equal(1);

      await registry.connect(provider2).register(
        PEER_ID_2, MULTIADDRS, PIPELINES_AUDIO, PRICE_PER_TOKEN, false,
        { value: MIN_STAKE }
      );
      expect(await registry.getProviderCount()).to.equal(2);
    });

    it("getActiveProviderCount should reflect active/inactive changes", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployProviderRegistry);

      await registerProvider1(registry, provider1);
      await registry.connect(provider2).register(
        PEER_ID_2, MULTIADDRS, PIPELINES_AUDIO, PRICE_PER_TOKEN, false,
        { value: MIN_STAKE }
      );
      expect(await registry.getActiveProviderCount()).to.equal(2);

      await registry.connect(provider1).deactivate();
      expect(await registry.getActiveProviderCount()).to.equal(1);

      await registry.connect(provider1).activate();
      expect(await registry.getActiveProviderCount()).to.equal(2);
    });

    it("providerAddresses should be accessible by index", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider2).register(
        PEER_ID_2, MULTIADDRS, PIPELINES_AUDIO, PRICE_PER_TOKEN, false,
        { value: MIN_STAKE }
      );

      expect(await registry.providerAddresses(0)).to.equal(provider1.address);
      expect(await registry.providerAddresses(1)).to.equal(provider2.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. ADMIN
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Admin", function () {
    describe("setPlatformFee", function () {
      it("should update platform fee", async function () {
        const { registry, owner } = await loadFixture(deployProviderRegistry);
        await registry.connect(owner).setPlatformFee(500);
        expect(await registry.platformFeeBps()).to.equal(500);
      });

      it("should allow setting fee to zero", async function () {
        const { registry, owner } = await loadFixture(deployProviderRegistry);
        await registry.connect(owner).setPlatformFee(0);
        expect(await registry.platformFeeBps()).to.equal(0);
      });

      it("should allow setting fee to max (1000 bps = 10%)", async function () {
        const { registry, owner } = await loadFixture(deployProviderRegistry);
        await registry.connect(owner).setPlatformFee(1000);
        expect(await registry.platformFeeBps()).to.equal(1000);
      });

      it("should revert with FeeTooHigh when fee exceeds 1000 bps", async function () {
        const { registry, owner } = await loadFixture(deployProviderRegistry);
        await expect(
          registry.connect(owner).setPlatformFee(1001)
        ).to.be.revertedWithCustomError(registry, "FeeTooHigh")
          .withArgs(1001, 1000);
      });

      it("should revert when called by non-owner", async function () {
        const { registry, provider1 } = await loadFixture(deployProviderRegistry);
        await expect(
          registry.connect(provider1).setPlatformFee(500)
        ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      });
    });

    describe("setMinStake", function () {
      it("should update minimum stake", async function () {
        const { registry, owner } = await loadFixture(deployProviderRegistry);
        const newMinStake = ethers.parseEther("0.5");
        await registry.connect(owner).setMinStake(newMinStake);
        expect(await registry.minStakeAmount()).to.equal(newMinStake);
      });

      it("should allow setting min stake to zero", async function () {
        const { registry, owner } = await loadFixture(deployProviderRegistry);
        await registry.connect(owner).setMinStake(0);
        expect(await registry.minStakeAmount()).to.equal(0);
      });

      it("should revert when called by non-owner", async function () {
        const { registry, provider1 } = await loadFixture(deployProviderRegistry);
        await expect(
          registry.connect(provider1).setMinStake(ethers.parseEther("0.5"))
        ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      });
    });

    describe("setTreasury", function () {
      it("should update treasury address", async function () {
        const { registry, owner, provider1 } = await loadFixture(deployProviderRegistry);
        await registry.connect(owner).setTreasury(provider1.address);
        expect(await registry.treasury()).to.equal(provider1.address);
      });

      it("should revert with ZeroAddress for zero address", async function () {
        const { registry, owner } = await loadFixture(deployProviderRegistry);
        await expect(
          registry.connect(owner).setTreasury(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(registry, "ZeroAddress");
      });

      it("should revert when called by non-owner", async function () {
        const { registry, provider1 } = await loadFixture(deployProviderRegistry);
        await expect(
          registry.connect(provider1).setTreasury(provider1.address)
        ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      });
    });

    describe("setPaymentContract", function () {
      it("should update payment contract address", async function () {
        const { registry, owner, paymentContract } = await loadFixture(deployProviderRegistry);
        await registry.connect(owner).setPaymentContract(paymentContract.address);
        expect(await registry.paymentContract()).to.equal(paymentContract.address);
      });

      it("should revert with ZeroAddress for zero address", async function () {
        const { registry, owner } = await loadFixture(deployProviderRegistry);
        await expect(
          registry.connect(owner).setPaymentContract(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(registry, "ZeroAddress");
      });

      it("should revert when called by non-owner", async function () {
        const { registry, provider1, paymentContract } = await loadFixture(deployProviderRegistry);
        await expect(
          registry.connect(provider1).setPaymentContract(paymentContract.address)
        ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      });
    });

    describe("slashProvider", function () {
      it("should slash provider stake and transfer to treasury", async function () {
        const { registry, owner, treasury, provider1 } = await loadFixture(deployProviderRegistry);
        await registerProvider1(registry, provider1);

        const slashAmount = ethers.parseEther("0.05");
        const treasuryBefore = await ethers.provider.getBalance(treasury.address);

        await registry.connect(owner).slashProvider(provider1.address, slashAmount, "misbehavior");

        const provider = await registry.getProvider(provider1.address);
        expect(provider.stakedAmount).to.equal(MIN_STAKE - slashAmount);

        const treasuryAfter = await ethers.provider.getBalance(treasury.address);
        expect(treasuryAfter - treasuryBefore).to.equal(slashAmount);
      });

      it("should allow slashing entire stake", async function () {
        const { registry, owner, provider1 } = await loadFixture(deployProviderRegistry);
        await registerProvider1(registry, provider1);

        await registry.connect(owner).slashProvider(provider1.address, MIN_STAKE, "total slash");

        const provider = await registry.getProvider(provider1.address);
        expect(provider.stakedAmount).to.equal(0);
      });

      it("should revert with ZeroAmount when amount is zero", async function () {
        const { registry, owner, provider1 } = await loadFixture(deployProviderRegistry);
        await registerProvider1(registry, provider1);

        await expect(
          registry.connect(owner).slashProvider(provider1.address, 0, "reason")
        ).to.be.revertedWithCustomError(registry, "ZeroAmount");
      });

      it("should revert with InsufficientStakeBalance when slashing more than staked", async function () {
        const { registry, owner, provider1 } = await loadFixture(deployProviderRegistry);
        await registerProvider1(registry, provider1);

        const tooMuch = MIN_STAKE + ethers.parseEther("1");
        await expect(
          registry.connect(owner).slashProvider(provider1.address, tooMuch, "reason")
        ).to.be.revertedWithCustomError(registry, "InsufficientStakeBalance")
          .withArgs(tooMuch, MIN_STAKE);
      });

      it("should revert when called by non-owner", async function () {
        const { registry, provider1 } = await loadFixture(deployProviderRegistry);
        await registerProvider1(registry, provider1);

        await expect(
          registry.connect(provider1).slashProvider(
            provider1.address, ethers.parseEther("0.01"), "reason"
          )
        ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      });
    });

    describe("pause / unpause", function () {
      it("should allow owner to pause", async function () {
        const { registry, owner } = await loadFixture(deployProviderRegistry);
        await registry.connect(owner).pause();
        expect(await registry.paused()).to.be.true;
      });

      it("should allow owner to unpause", async function () {
        const { registry, owner } = await loadFixture(deployProviderRegistry);
        await registry.connect(owner).pause();
        await registry.connect(owner).unpause();
        expect(await registry.paused()).to.be.false;
      });

      it("should revert pause when called by non-owner", async function () {
        const { registry, provider1 } = await loadFixture(deployProviderRegistry);
        await expect(
          registry.connect(provider1).pause()
        ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      });

      it("should revert unpause when called by non-owner", async function () {
        const { registry, owner, provider1 } = await loadFixture(deployProviderRegistry);
        await registry.connect(owner).pause();
        await expect(
          registry.connect(provider1).unpause()
        ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. PAUSABLE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Pausable", function () {
    it("should revert register when paused", async function () {
      const { registry, owner, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(owner).pause();

      await expect(
        registerProvider1(registry, provider1)
      ).to.be.revertedWithCustomError(registry, "EnforcedPause");
    });

    it("should revert updateProvider when paused", async function () {
      const { registry, owner, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(owner).pause();

      await expect(
        registry.connect(provider1).updateProvider(
          PEER_ID_2, MULTIADDRS, PIPELINES_AUDIO, PRICE_PER_TOKEN_2, false
        )
      ).to.be.revertedWithCustomError(registry, "EnforcedPause");
    });

    it("should allow register after unpause", async function () {
      const { registry, owner, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(owner).pause();
      await registry.connect(owner).unpause();

      await registerProvider1(registry, provider1);
      const provider = await registry.getProvider(provider1.address);
      expect(provider.wallet).to.equal(provider1.address);
    });

    it("should allow deactivate even when paused", async function () {
      const { registry, owner, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(owner).pause();

      // deactivate is not whenNotPaused
      await registry.connect(provider1).deactivate();
      const provider = await registry.getProvider(provider1.address);
      expect(provider.isActive).to.be.false;
    });

    it("should allow activate even when paused", async function () {
      const { registry, owner, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider1).deactivate();
      await registry.connect(owner).pause();

      // activate is not whenNotPaused
      await registry.connect(provider1).activate();
      const provider = await registry.getProvider(provider1.address);
      expect(provider.isActive).to.be.true;
    });

    it("should allow heartbeat even when paused", async function () {
      const { registry, owner, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(owner).pause();

      // heartbeat is not whenNotPaused
      await registry.connect(provider1).heartbeat();
    });

    it("should allow withdrawStake even when paused", async function () {
      const { registry, owner, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider1).deactivate();
      await registry.connect(owner).pause();

      // withdrawStake is not whenNotPaused
      await registry.connect(provider1).withdrawStake(MIN_STAKE);
      const provider = await registry.getProvider(provider1.address);
      expect(provider.stakedAmount).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Events", function () {
    it("should emit ProviderRegistered on new registration", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);

      await expect(
        registry.connect(provider1).register(
          PEER_ID_1, MULTIADDRS, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN, false,
          { value: MIN_STAKE }
        )
      ).to.emit(registry, "ProviderRegistered")
        .withArgs(provider1.address, PEER_ID_1, PIPELINES_LLM_IMAGE, PRICE_PER_TOKEN);
    });

    it("should emit ProviderUpdated on re-registration (update via register)", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await expect(
        registry.connect(provider1).register(
          PEER_ID_2, MULTIADDRS_2, PIPELINES_AUDIO, PRICE_PER_TOKEN_2, true,
          { value: MIN_STAKE }
        )
      ).to.emit(registry, "ProviderUpdated")
        .withArgs(provider1.address, PEER_ID_2, PIPELINES_AUDIO, PRICE_PER_TOKEN_2);
    });

    it("should emit ProviderUpdated on updateProvider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await expect(
        registry.connect(provider1).updateProvider(
          PEER_ID_2, MULTIADDRS_2, PIPELINES_AUDIO, PRICE_PER_TOKEN_2, true
        )
      ).to.emit(registry, "ProviderUpdated")
        .withArgs(provider1.address, PEER_ID_2, PIPELINES_AUDIO, PRICE_PER_TOKEN_2);
    });

    it("should emit ProviderDeactivated on deactivation", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      await expect(
        registry.connect(provider1).deactivate()
      ).to.emit(registry, "ProviderDeactivated")
        .withArgs(provider1.address);
    });

    it("should emit ProviderActivated on activation", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider1).deactivate();

      await expect(
        registry.connect(provider1).activate()
      ).to.emit(registry, "ProviderActivated")
        .withArgs(provider1.address);
    });

    it("should emit EarningsRecorded on recordEarnings", async function () {
      const { registry, owner, provider1, paymentContract } = await loadFixture(deployProviderRegistry);
      await registry.connect(owner).setPaymentContract(paymentContract.address);
      await registerProvider1(registry, provider1);

      const earnings = ethers.parseEther("0.5");
      await expect(
        registry.connect(paymentContract).recordEarnings(provider1.address, earnings)
      ).to.emit(registry, "EarningsRecorded")
        .withArgs(provider1.address, earnings);
    });

    it("should emit StakeWithdrawn on withdrawStake", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);
      await registry.connect(provider1).deactivate();

      await expect(
        registry.connect(provider1).withdrawStake(MIN_STAKE)
      ).to.emit(registry, "StakeWithdrawn")
        .withArgs(provider1.address, MIN_STAKE);
    });

    it("should emit ProviderSlashed on slashProvider", async function () {
      const { registry, owner, provider1 } = await loadFixture(deployProviderRegistry);
      await registerProvider1(registry, provider1);

      const slashAmount = ethers.parseEther("0.05");
      await expect(
        registry.connect(owner).slashProvider(provider1.address, slashAmount, "spam")
      ).to.emit(registry, "ProviderSlashed")
        .withArgs(provider1.address, slashAmount, "spam");
    });

    it("should emit PlatformFeeUpdated on setPlatformFee", async function () {
      const { registry, owner } = await loadFixture(deployProviderRegistry);
      await expect(
        registry.connect(owner).setPlatformFee(500)
      ).to.emit(registry, "PlatformFeeUpdated")
        .withArgs(PLATFORM_FEE_BPS, 500);
    });

    it("should emit MinStakeUpdated on setMinStake", async function () {
      const { registry, owner } = await loadFixture(deployProviderRegistry);
      const newMinStake = ethers.parseEther("0.5");
      await expect(
        registry.connect(owner).setMinStake(newMinStake)
      ).to.emit(registry, "MinStakeUpdated")
        .withArgs(MIN_STAKE, newMinStake);
    });

    it("should emit TreasuryUpdated on setTreasury", async function () {
      const { registry, owner, treasury, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(
        registry.connect(owner).setTreasury(provider1.address)
      ).to.emit(registry, "TreasuryUpdated")
        .withArgs(treasury.address, provider1.address);
    });

    it("should emit PaymentContractUpdated on setPaymentContract", async function () {
      const { registry, owner, paymentContract } = await loadFixture(deployProviderRegistry);
      await expect(
        registry.connect(owner).setPaymentContract(paymentContract.address)
      ).to.emit(registry, "PaymentContractUpdated")
        .withArgs(ethers.ZeroAddress, paymentContract.address);
    });
  });
});
