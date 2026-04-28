const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployProviderRegistry } = require("./helpers/deploy");

const PEER_A = "12D3KooWAlphaTestPeerIdAAA";
const PEER_B = "12D3KooWBravoTestPeerIdBBB";
const ADDRS_A = ["/ip4/127.0.0.1/tcp/4002/p2p/" + PEER_A];
const ADDRS_B = ["/ip4/127.0.0.1/tcp/4003/p2p/" + PEER_B];
const PIPELINES_LLM = [0]; // LLM
const PIPELINES_MULTI = [0, 1, 5, 9, 11]; // LLM, image_turbo, audio (legacy), video, shard

describe("BonzaiProviderRegistry", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("sets treasury", async function () {
      const { registry, treasury } = await loadFixture(deployProviderRegistry);
      expect(await registry.treasury()).to.equal(treasury.address);
    });

    it("starts with zero providers", async function () {
      const { registry } = await loadFixture(deployProviderRegistry);
      expect(await registry.getProviderCount()).to.equal(0);
      expect(await registry.getActiveProviderCount()).to.equal(0);
    });

    it("rejects zero treasury", async function () {
      const BonzaiProviderRegistry = await ethers.getContractFactory("BonzaiProviderRegistry");
      await expect(BonzaiProviderRegistry.deploy(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(BonzaiProviderRegistry, "ZeroAddress");
    });

    it("MAX_PIPELINE_CATEGORY is 11 (PIPELINE_SHARD)", async function () {
      const { registry } = await loadFixture(deployProviderRegistry);
      expect(await registry.MAX_PIPELINE_CATEGORY()).to.equal(11);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("register", function () {
    it("registers a new provider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false);
      const p = await registry.getProvider(provider1.address);
      expect(p.wallet).to.equal(provider1.address);
      expect(p.peerId).to.equal(PEER_A);
      expect(p.isActive).to.equal(true);
      expect(p.isRelay).to.equal(false);
    });

    it("emits ProviderRegistered for first registration", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false))
        .to.emit(registry, "ProviderRegistered")
        .withArgs(provider1.address, PEER_A, PIPELINES_LLM);
    });

    it("emits ProviderUpdated when re-registering same wallet", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false);
      await expect(registry.connect(provider1).register(PEER_B, ADDRS_B, PIPELINES_MULTI, true))
        .to.emit(registry, "ProviderUpdated")
        .withArgs(provider1.address, PEER_B, PIPELINES_MULTI);
    });

    it("rejects empty peerId", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(registry.connect(provider1).register("", ADDRS_A, PIPELINES_LLM, false))
        .to.be.revertedWithCustomError(registry, "EmptyPeerId");
    });

    it("rejects empty pipelines list", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(registry.connect(provider1).register(PEER_A, ADDRS_A, [], false))
        .to.be.revertedWithCustomError(registry, "NoPipelines");
    });

    it("rejects pipeline category above MAX", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(registry.connect(provider1).register(PEER_A, ADDRS_A, [99], false))
        .to.be.revertedWithCustomError(registry, "InvalidPipelineCategory")
        .withArgs(99, 11);
    });

    it("rejects taken peerId", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false);
      await expect(registry.connect(provider2).register(PEER_A, ADDRS_B, PIPELINES_LLM, false))
        .to.be.revertedWithCustomError(registry, "PeerIdTaken")
        .withArgs(PEER_A);
    });

    it("preserves registeredAt across re-registration", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false);
      const firstRegistered = (await registry.getProvider(provider1.address)).registeredAt;
      await ethers.provider.send("evm_increaseTime", [60]);
      await ethers.provider.send("evm_mine", []);
      await registry.connect(provider1).register(PEER_B, ADDRS_B, PIPELINES_MULTI, true);
      expect((await registry.getProvider(provider1.address)).registeredAt).to.equal(firstRegistered);
    });

    it("clears the old peerId mapping when re-registering with a new peer ID", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false);
      await registry.connect(provider1).register(PEER_B, ADDRS_B, PIPELINES_LLM, false);
      expect(await registry.peerIdToWallet(PEER_A)).to.equal(ethers.ZeroAddress);
      expect(await registry.peerIdToWallet(PEER_B)).to.equal(provider1.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("updateProvider", function () {
    it("updates pipelines + relay flag", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false);
      await registry.connect(provider1).updateProvider(PEER_A, ADDRS_A, PIPELINES_MULTI, true);
      const p = await registry.getProvider(provider1.address);
      expect(p.pipelines.length).to.equal(PIPELINES_MULTI.length);
      expect(p.isRelay).to.equal(true);
    });

    it("rejects non-registered caller", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(registry.connect(provider1).updateProvider(PEER_A, ADDRS_A, PIPELINES_LLM, false))
        .to.be.revertedWithCustomError(registry, "NotRegistered");
    });

    it("rejects taken peerId from another wallet", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false);
      await registry.connect(provider2).register(PEER_B, ADDRS_B, PIPELINES_LLM, false);
      await expect(registry.connect(provider2).updateProvider(PEER_A, ADDRS_A, PIPELINES_LLM, false))
        .to.be.revertedWithCustomError(registry, "PeerIdTaken")
        .withArgs(PEER_A);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // (DE)ACTIVATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Activation", function () {
    it("deactivate flips isActive to false and clears peerId mapping", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false);
      await registry.connect(provider1).deactivate();
      expect((await registry.getProvider(provider1.address)).isActive).to.equal(false);
      expect(await registry.peerIdToWallet(PEER_A)).to.equal(ethers.ZeroAddress);
    });

    it("activate restores isActive and re-claims peerId", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false);
      await registry.connect(provider1).deactivate();
      await registry.connect(provider1).activate();
      expect((await registry.getProvider(provider1.address)).isActive).to.equal(true);
      expect(await registry.peerIdToWallet(PEER_A)).to.equal(provider1.address);
    });

    it("activate reverts if another provider has claimed the peerId", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false);
      await registry.connect(provider1).deactivate();
      await registry.connect(provider2).register(PEER_A, ADDRS_B, PIPELINES_LLM, false);
      await expect(registry.connect(provider1).activate())
        .to.be.revertedWithCustomError(registry, "PeerIdTaken")
        .withArgs(PEER_A);
    });

    it("emits ProviderDeactivated / ProviderActivated", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false);
      await expect(registry.connect(provider1).deactivate())
        .to.emit(registry, "ProviderDeactivated").withArgs(provider1.address);
      await expect(registry.connect(provider1).activate())
        .to.emit(registry, "ProviderActivated").withArgs(provider1.address);
    });

    it("deactivate reverts when not registered", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(registry.connect(provider1).deactivate())
        .to.be.revertedWithCustomError(registry, "NotRegistered");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARD CAPABILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Shard capabilities", function () {
    it("setShardCapabilities updates fields and emits", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, [11], false);
      await expect(registry.connect(provider1).setShardCapabilities(48, 1234, 16384))
        .to.emit(registry, "ShardCapabilitiesUpdated")
        .withArgs(provider1.address, 48, 1234, 16384);
      const p = await registry.getProvider(provider1.address);
      expect(p.maxLayers).to.equal(48);
      expect(p.computeScore).to.equal(1234);
      expect(p.memoryMB).to.equal(16384);
    });

    it("setShardCapabilities reverts when not registered", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(registry.connect(provider1).setShardCapabilities(48, 1234, 16384))
        .to.be.revertedWithCustomError(registry, "NotRegistered");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EARNINGS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("recordEarnings (paymentContract only)", function () {
    it("rejects calls from non-paymentContract", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false);
      await expect(registry.connect(provider1).recordEarnings(provider1.address, 100))
        .to.be.revertedWithCustomError(registry, "OnlyPaymentContract");
    });

    it("paymentContract can record earnings, updates totals + completedJobs", async function () {
      const { registry, provider1, paymentContract } = await loadFixture(deployProviderRegistry);
      await registry.setPaymentContract(paymentContract.address);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false);
      await expect(registry.connect(paymentContract).recordEarnings(provider1.address, 12345))
        .to.emit(registry, "EarningsRecorded")
        .withArgs(provider1.address, 12345);
      const p = await registry.getProvider(provider1.address);
      expect(p.totalEarnings).to.equal(12345);
      expect(p.completedJobs).to.equal(1);
    });

    it("rejects recording for unregistered provider", async function () {
      const { registry, paymentContract, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.setPaymentContract(paymentContract.address);
      await expect(registry.connect(paymentContract).recordEarnings(provider1.address, 5))
        .to.be.revertedWithCustomError(registry, "ProviderNotRegistered");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HEARTBEAT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("heartbeat", function () {
    it("updates lastSeenAt", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false);
      const before = (await registry.getProvider(provider1.address)).lastSeenAt;
      await ethers.provider.send("evm_increaseTime", [120]);
      await ethers.provider.send("evm_mine", []);
      await registry.connect(provider1).heartbeat();
      const after = (await registry.getProvider(provider1.address)).lastSeenAt;
      expect(after).to.be.gt(before);
    });

    it("reverts when not registered", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(registry.connect(provider1).heartbeat())
        .to.be.revertedWithCustomError(registry, "NotRegistered");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEWS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Views", function () {
    it("getProviderByPeerId returns the right provider", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, PIPELINES_LLM, false);
      const p = await registry.getProviderByPeerId(PEER_A);
      expect(p.wallet).to.equal(provider1.address);
    });

    it("getProvidersForPipeline returns only matching active providers", async function () {
      const { registry, provider1, provider2, provider3 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, [0], false);
      await registry.connect(provider2).register(PEER_B, ADDRS_B, [1], false);
      await registry.connect(provider3).register("12D3KooWGammaTestPeerIdGGG", [], [0], false);
      await registry.connect(provider3).deactivate();
      const llmProviders = await registry.getProvidersForPipeline(0);
      expect(llmProviders.length).to.equal(1);
      expect(llmProviders[0].wallet).to.equal(provider1.address);
    });

    it("getRelayNodes returns only active relays", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, [0], true);
      await registry.connect(provider2).register(PEER_B, ADDRS_B, [0], false);
      const relays = await registry.getRelayNodes();
      expect(relays.length).to.equal(1);
      expect(relays[0].wallet).to.equal(provider1.address);
    });

    it("getProviderCount and getActiveProviderCount", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, [0], false);
      await registry.connect(provider2).register(PEER_B, ADDRS_B, [0], false);
      await registry.connect(provider2).deactivate();
      expect(await registry.getProviderCount()).to.equal(2);
      expect(await registry.getActiveProviderCount()).to.equal(1);
    });

    it("getShardProviders filters by maxLayers + memoryMB", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, [11], false);
      await registry.connect(provider1).setShardCapabilities(64, 100, 32000);
      await registry.connect(provider2).register(PEER_B, ADDRS_B, [11], false);
      await registry.connect(provider2).setShardCapabilities(8, 50, 4000);

      const fits = await registry.getShardProviders(32, 16000);
      expect(fits.length).to.equal(1);
      expect(fits[0].wallet).to.equal(provider1.address);
    });

    it("providerAddresses array tracks all registrations", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployProviderRegistry);
      await registry.connect(provider1).register(PEER_A, ADDRS_A, [0], false);
      await registry.connect(provider2).register(PEER_B, ADDRS_B, [0], false);
      expect(await registry.providerAddresses(0)).to.equal(provider1.address);
      expect(await registry.providerAddresses(1)).to.equal(provider2.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Admin", function () {
    it("setTreasury changes treasury and emits", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(registry.setTreasury(provider1.address))
        .to.emit(registry, "TreasuryUpdated");
      expect(await registry.treasury()).to.equal(provider1.address);
    });

    it("setPaymentContract emits and assigns", async function () {
      const { registry, paymentContract } = await loadFixture(deployProviderRegistry);
      await expect(registry.setPaymentContract(paymentContract.address))
        .to.emit(registry, "PaymentContractUpdated");
      expect(await registry.paymentContract()).to.equal(paymentContract.address);
    });

    it("setTreasury rejects zero address", async function () {
      const { registry } = await loadFixture(deployProviderRegistry);
      await expect(registry.setTreasury(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(registry, "ZeroAddress");
    });

    it("only owner can pause", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await expect(registry.connect(provider1).pause())
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });

    it("pause blocks new registrations", async function () {
      const { registry, provider1 } = await loadFixture(deployProviderRegistry);
      await registry.pause();
      await expect(registry.connect(provider1).register(PEER_A, ADDRS_A, [0], false))
        .to.be.revertedWithCustomError(registry, "EnforcedPause");
    });
  });
});
