const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deploySkillRegistry } = require("./helpers/deploy");
const {
  SKILL_PURCHASE_PRICE,
  SKILL_RUNNING_FEE,
  SKILL_CO_OWNER_SHARE_BPS,
  SKILL_TREASURY_SHARE_BPS,
} = require("./helpers/constants");

const NAME = "test-skill";
const VERSION = "1.0.0";
const CATEGORY = "education";
const IPFS_HASH = "QmTestSkillHash";
const FREE_PRICE = 0n;
const FREE_FEE = 0n;
const BPS = 10000n;

describe("BonzaiSkillRegistry", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function computeSkillId(name, version, authorAddress) {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "string", "address"],
        [name, version, authorAddress],
      ),
    );
  }

  async function registerSkill(registry, author, overrides = {}) {
    const name = overrides.name ?? NAME;
    const version = overrides.version ?? VERSION;
    const category = overrides.category ?? CATEGORY;
    const ipfsHash = overrides.ipfsHash ?? IPFS_HASH;
    const purchasePrice = overrides.purchasePrice ?? SKILL_PURCHASE_PRICE;
    const runningFee = overrides.runningFee ?? FREE_FEE;

    await registry.connect(author).registerSkill(
      name, version, category, ipfsHash, purchasePrice, runningFee,
    );
    const skillId = computeSkillId(name, version, author.address);
    return { skillId, name, version, category, ipfsHash, purchasePrice, runningFee };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("sets treasury + skillOwnership", async function () {
      const { registry, mockOwnership, treasury } = await loadFixture(deploySkillRegistry);
      expect(await registry.treasury()).to.equal(treasury.address);
      expect(await registry.skillOwnershipContract()).to.equal(await mockOwnership.getAddress());
    });

    it("rejects zero treasury", async function () {
      const MockSkillOwnership = await ethers.getContractFactory("MockSkillOwnership");
      const mockOwnership = await MockSkillOwnership.deploy();
      const BonzaiSkillRegistry = await ethers.getContractFactory("BonzaiSkillRegistry");
      await expect(
        BonzaiSkillRegistry.deploy(ethers.ZeroAddress, await mockOwnership.getAddress())
      ).to.be.revertedWithCustomError(BonzaiSkillRegistry, "ZeroAddress");
    });

    it("MAX_RUNNING_FEE is 0.5 ether", async function () {
      const { registry } = await loadFixture(deploySkillRegistry);
      expect(await registry.MAX_RUNNING_FEE()).to.equal(ethers.parseEther("0.5"));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("registerSkill", function () {
    it("registers a paid skill", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1);
      const skill = await registry.skills(skillId);
      expect(skill.author).to.equal(author1.address);
      expect(skill.purchasePrice).to.equal(SKILL_PURCHASE_PRICE);
      expect(skill.isActive).to.equal(true);
    });

    it("registers a free skill (price = 0)", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1, { purchasePrice: FREE_PRICE });
      expect((await registry.skills(skillId)).purchasePrice).to.equal(0);
    });

    it("rejects duplicate (name, version)", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await registerSkill(registry, author1);
      await expect(registerSkill(registry, author1))
        .to.be.revertedWithCustomError(registry, "SkillAlreadyExists");
    });

    it("rejects invalid category", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await expect(registerSkill(registry, author1, { category: "not_a_category" }))
        .to.be.revertedWithCustomError(registry, "InvalidCategory");
    });

    it("rejects running fee above MAX_RUNNING_FEE", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await expect(registerSkill(registry, author1, { runningFee: ethers.parseEther("1") }))
        .to.be.revertedWithCustomError(registry, "RunningFeeTooHigh");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PURCHASE (ETH)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("purchaseSkill (ETH)", function () {
    it("splits 80% to ownership, 20% to treasury", async function () {
      const { registry, mockOwnership, author1, buyer1, treasury } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1);

      const expectedCo = (SKILL_PURCHASE_PRICE * SKILL_CO_OWNER_SHARE_BPS) / BPS;
      const expectedTreasury = SKILL_PURCHASE_PRICE - expectedCo;

      const ownershipAddr = await mockOwnership.getAddress();
      const ownershipBefore = await ethers.provider.getBalance(ownershipAddr);
      const treasuryBefore = await ethers.provider.getBalance(treasury.address);

      await registry.connect(buyer1).purchaseSkill(skillId, SKILL_PURCHASE_PRICE, {
        value: SKILL_PURCHASE_PRICE,
      });

      expect(await ethers.provider.getBalance(ownershipAddr) - ownershipBefore).to.equal(expectedCo);
      expect(await ethers.provider.getBalance(treasury.address) - treasuryBefore).to.equal(expectedTreasury);
    });

    it("emits SkillPurchased event", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1);
      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, SKILL_PURCHASE_PRICE, { value: SKILL_PURCHASE_PRICE })
      ).to.emit(registry, "SkillPurchased");
    });

    it("rejects insufficient ETH", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1);
      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, SKILL_PURCHASE_PRICE, { value: SKILL_PURCHASE_PRICE - 1n })
      ).to.be.revertedWith("Insufficient ETH");
    });

    it("rejects price exceeding maxPrice (slippage)", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1);
      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, SKILL_PURCHASE_PRICE - 1n, { value: SKILL_PURCHASE_PRICE })
      ).to.be.revertedWith("Price exceeds maximum");
    });

    it("refunds excess ETH to buyer", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1);
      const overpay = SKILL_PURCHASE_PRICE + ethers.parseEther("0.01");
      const balBefore = await ethers.provider.getBalance(buyer1.address);
      const tx = await registry.connect(buyer1).purchaseSkill(skillId, SKILL_PURCHASE_PRICE, { value: overpay });
      const r = await tx.wait();
      const gas = r.gasUsed * r.gasPrice;
      const balAfter = await ethers.provider.getBalance(buyer1.address);
      // Buyer net cost = price + gas (NOT overpay + gas)
      expect(balBefore - balAfter - gas).to.equal(SKILL_PURCHASE_PRICE);
    });

    it("rejects double-purchase", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1);
      await registry.connect(buyer1).purchaseSkill(skillId, SKILL_PURCHASE_PRICE, { value: SKILL_PURCHASE_PRICE });
      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, SKILL_PURCHASE_PRICE, { value: SKILL_PURCHASE_PRICE })
      ).to.be.revertedWithCustomError(registry, "AlreadyPurchased");
    });

    it("free skill (price = 0) doesn't transfer ETH", async function () {
      const { registry, author1, buyer1, treasury } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1, { purchasePrice: FREE_PRICE });
      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, 0n, { value: 0n })
      ).to.changeEtherBalance(treasury, 0n);
      expect(await registry.hasPurchased(buyer1.address, skillId)).to.equal(true);
    });

    it("ownership share falls back to treasury when SkillOwnership reverts", async function () {
      const { registry, mockOwnership, author1, buyer1, treasury } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1);
      await mockOwnership.setRevert(true);

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, SKILL_PURCHASE_PRICE, { value: SKILL_PURCHASE_PRICE })
      ).to.emit(registry, "CoOwnerShareFallbackToTreasury");
      expect(await ethers.provider.getBalance(treasury.address) - treasuryBefore).to.equal(SKILL_PURCHASE_PRICE);
    });

    it("totalTreasuryFees accumulates across purchases", async function () {
      const { registry, author1, buyer1, buyer2 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1);
      const treasuryShare = SKILL_PURCHASE_PRICE - (SKILL_PURCHASE_PRICE * SKILL_CO_OWNER_SHARE_BPS) / BPS;
      await registry.connect(buyer1).purchaseSkill(skillId, SKILL_PURCHASE_PRICE, { value: SKILL_PURCHASE_PRICE });
      await registry.connect(buyer2).purchaseSkill(skillId, SKILL_PURCHASE_PRICE, { value: SKILL_PURCHASE_PRICE });
      expect(await registry.totalTreasuryFees()).to.equal(treasuryShare * 2n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTION (ETH running fee)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("recordExecution (ETH)", function () {
    it("charges + splits running fee on execution", async function () {
      const { registry, mockOwnership, author1, buyer1, treasury } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1, { runningFee: SKILL_RUNNING_FEE });
      await registry.connect(buyer1).purchaseSkill(skillId, SKILL_PURCHASE_PRICE, { value: SKILL_PURCHASE_PRICE });

      const expectedCo = (SKILL_RUNNING_FEE * SKILL_CO_OWNER_SHARE_BPS) / BPS;
      const expectedTreasury = SKILL_RUNNING_FEE - expectedCo;
      const ownershipAddr = await mockOwnership.getAddress();
      const ownershipBefore = await ethers.provider.getBalance(ownershipAddr);
      const treasuryBefore = await ethers.provider.getBalance(treasury.address);

      await registry.connect(buyer1).recordExecution(skillId, { value: SKILL_RUNNING_FEE });

      expect(await ethers.provider.getBalance(ownershipAddr) - ownershipBefore).to.equal(expectedCo);
      expect(await ethers.provider.getBalance(treasury.address) - treasuryBefore).to.equal(expectedTreasury);
    });

    it("rejects insufficient ETH for running fee", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1, { runningFee: SKILL_RUNNING_FEE });
      await registry.connect(buyer1).purchaseSkill(skillId, SKILL_PURCHASE_PRICE, { value: SKILL_PURCHASE_PRICE });
      await expect(
        registry.connect(buyer1).recordExecution(skillId, { value: SKILL_RUNNING_FEE - 1n })
      ).to.be.revertedWith("Insufficient ETH for running fee");
    });

    it("rejects execution from non-purchaser when price > 0", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1, { runningFee: SKILL_RUNNING_FEE });
      await expect(
        registry.connect(buyer1).recordExecution(skillId, { value: SKILL_RUNNING_FEE })
      ).to.be.revertedWithCustomError(registry, "NotPurchased");
    });

    it("free skill exec is gratis (no ETH required)", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1, { purchasePrice: 0n, runningFee: 0n });
      await registry.connect(buyer1).purchaseSkill(skillId, 0n, { value: 0n });
      await expect(registry.connect(buyer1).recordExecution(skillId, { value: 0n }))
        .to.emit(registry, "SkillExecuted");
    });

    it("refunds overpay on exec", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1, { runningFee: SKILL_RUNNING_FEE });
      await registry.connect(buyer1).purchaseSkill(skillId, SKILL_PURCHASE_PRICE, { value: SKILL_PURCHASE_PRICE });

      const overpay = SKILL_RUNNING_FEE + ethers.parseEther("0.001");
      const balBefore = await ethers.provider.getBalance(buyer1.address);
      const tx = await registry.connect(buyer1).recordExecution(skillId, { value: overpay });
      const r = await tx.wait();
      const gas = r.gasUsed * r.gasPrice;
      expect(balBefore - (await ethers.provider.getBalance(buyer1.address)) - gas)
        .to.equal(SKILL_RUNNING_FEE);
    });

    it("totalTreasuryRunningFees accumulates", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1, { runningFee: SKILL_RUNNING_FEE });
      await registry.connect(buyer1).purchaseSkill(skillId, SKILL_PURCHASE_PRICE, { value: SKILL_PURCHASE_PRICE });
      const expectedTreasury = SKILL_RUNNING_FEE - (SKILL_RUNNING_FEE * SKILL_CO_OWNER_SHARE_BPS) / BPS;
      await registry.connect(buyer1).recordExecution(skillId, { value: SKILL_RUNNING_FEE });
      await registry.connect(buyer1).recordExecution(skillId, { value: SKILL_RUNNING_FEE });
      expect(await registry.totalTreasuryRunningFees()).to.equal(expectedTreasury * 2n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL UPDATES + STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Skill management", function () {
    it("author can update purchase price + ipfs hash", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1);
      const newPrice = ethers.parseEther("0.02");
      const newHash = "QmNewHashLongerThan10Chars";
      await registry.connect(author1).updateSkill(skillId, newHash, newPrice, FREE_FEE);
      const skill = await registry.skills(skillId);
      expect(skill.purchasePrice).to.equal(newPrice);
      expect(skill.ipfsHash).to.equal(newHash);
    });

    it("non-author cannot update", async function () {
      const { registry, author1, author2 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1);
      await expect(
        registry.connect(author2).updateSkill(skillId, IPFS_HASH, SKILL_PURCHASE_PRICE, FREE_FEE)
      ).to.be.revertedWithCustomError(registry, "NotAuthor");
    });

    it("author can deactivate + reactivate", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1);
      await registry.connect(author1).deactivateSkill(skillId);
      expect((await registry.skills(skillId)).isActive).to.equal(false);
      await registry.connect(author1).reactivateSkill(skillId);
      expect((await registry.skills(skillId)).isActive).to.equal(true);
    });

    it("admin-deactivated skills cannot be reactivated by author", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1);
      await registry.adminDeactivateSkill(skillId);
      await expect(registry.connect(author1).reactivateSkill(skillId))
        .to.be.revertedWith("Admin deactivated");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Admin", function () {
    it("setTreasury changes treasury and emits", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await expect(registry.setTreasury(author1.address))
        .to.emit(registry, "TreasuryUpdated");
      expect(await registry.treasury()).to.equal(author1.address);
    });

    it("setSkillOwnershipContract emits and assigns", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await expect(registry.setSkillOwnershipContract(author1.address))
        .to.emit(registry, "SkillOwnershipContractUpdated");
      expect(await registry.skillOwnershipContract()).to.equal(author1.address);
    });

    it("getStats returns ETH counters", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerSkill(registry, author1);
      await registry.connect(buyer1).purchaseSkill(skillId, SKILL_PURCHASE_PRICE, { value: SKILL_PURCHASE_PRICE });
      const [totalSkills, totalTreasuryFees, totalTreasuryRunningFees] = await registry.getStats();
      expect(totalSkills).to.equal(1);
      const expectedTreasury = SKILL_PURCHASE_PRICE - (SKILL_PURCHASE_PRICE * SKILL_CO_OWNER_SHARE_BPS) / BPS;
      expect(totalTreasuryFees).to.equal(expectedTreasury);
      expect(totalTreasuryRunningFees).to.equal(0);
    });

    it("rejects direct ETH transfers via receive()", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await expect(
        author1.sendTransaction({ to: await registry.getAddress(), value: ethers.parseEther("0.01") })
      ).to.be.revertedWithCustomError(registry, "UseCorrectFunction");
    });
  });
});
