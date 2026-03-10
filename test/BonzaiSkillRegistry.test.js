const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deploySkillRegistry } = require("./helpers/deploy");
const { SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE, VALID_CATEGORIES } = require("./helpers/constants");

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const VALID_IPFS_HASH = "QmTestHash1234567890";
const SHORT_IPFS_HASH = "QmShort"; // < 10 chars, invalid

/**
 * Register a default skill and return its ID
 */
async function registerDefaultSkill(registry, author, overrides = {}) {
  const name = overrides.name || "TestSkill";
  const version = overrides.version || "1.0.0";
  const category = overrides.category || "education";
  const ipfsHash = overrides.ipfsHash || VALID_IPFS_HASH;
  const purchasePrice = overrides.purchasePrice ?? SKILL_PURCHASE_PRICE;
  const runningFee = overrides.runningFee ?? SKILL_RUNNING_FEE;

  const tx = await registry.connect(author).registerSkill(
    name,
    version,
    category,
    ipfsHash,
    purchasePrice,
    runningFee
  );

  const skillId = await registry.generateSkillId(name, version, author.address);
  return { tx, skillId, name, version, category, ipfsHash, purchasePrice, runningFee };
}

describe("BonzaiSkillRegistry", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      const { registry, owner } = await loadFixture(deploySkillRegistry);
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("should set the correct BONZAI token address", async function () {
      const { registry, bonzaiToken } = await loadFixture(deploySkillRegistry);
      expect(await registry.bonzaiToken()).to.equal(await bonzaiToken.getAddress());
    });

    it("should set the correct treasury address", async function () {
      const { registry, treasury } = await loadFixture(deploySkillRegistry);
      expect(await registry.treasury()).to.equal(treasury.address);
    });

    it("should set the correct skill ownership contract address", async function () {
      const { registry, mockOwnership } = await loadFixture(deploySkillRegistry);
      expect(await registry.skillOwnershipContract()).to.equal(await mockOwnership.getAddress());
    });

    it("should initialize with zero total skills", async function () {
      const { registry } = await loadFixture(deploySkillRegistry);
      expect(await registry.getTotalSkills()).to.equal(0);
    });

    it("should initialize with zero platform fees", async function () {
      const { registry } = await loadFixture(deploySkillRegistry);
      const [totalSkills, feesETH, feesBONZAI] = await registry.getStats();
      expect(totalSkills).to.equal(0);
      expect(feesETH).to.equal(0);
      expect(feesBONZAI).to.equal(0);
    });

    it("should initialize all 12 valid categories", async function () {
      const { registry } = await loadFixture(deploySkillRegistry);
      for (const category of VALID_CATEGORIES) {
        expect(await registry.validCategories(category)).to.be.true;
      }
    });

    it("should set MAX_SKILLS_PER_AUTHOR to 100", async function () {
      const { registry } = await loadFixture(deploySkillRegistry);
      expect(await registry.MAX_SKILLS_PER_AUTHOR()).to.equal(100);
    });

    it("should set MAX_RUNNING_FEE to 10000 tokens", async function () {
      const { registry } = await loadFixture(deploySkillRegistry);
      expect(await registry.MAX_RUNNING_FEE()).to.equal(ethers.parseEther("10000"));
    });

    it("should revert when BONZAI token is zero address", async function () {
      const [, treasury] = await ethers.getSigners();
      const MockSkillOwnership = await ethers.getContractFactory("MockSkillOwnership");
      const mockOwnership = await MockSkillOwnership.deploy();
      const BonzaiSkillRegistry = await ethers.getContractFactory("BonzaiSkillRegistry");
      await expect(
        BonzaiSkillRegistry.deploy(ethers.ZeroAddress, treasury.address, await mockOwnership.getAddress())
      ).to.be.revertedWithCustomError(BonzaiSkillRegistry, "ZeroAddress");
    });

    it("should revert when treasury is zero address", async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("BONZAI", "BONZAI");
      const MockSkillOwnership = await ethers.getContractFactory("MockSkillOwnership");
      const mockOwnership = await MockSkillOwnership.deploy();
      const BonzaiSkillRegistry = await ethers.getContractFactory("BonzaiSkillRegistry");
      await expect(
        BonzaiSkillRegistry.deploy(await token.getAddress(), ethers.ZeroAddress, await mockOwnership.getAddress())
      ).to.be.revertedWithCustomError(BonzaiSkillRegistry, "ZeroAddress");
    });

    it("should revert when skill ownership contract is zero address", async function () {
      const [, treasury] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("BONZAI", "BONZAI");
      const BonzaiSkillRegistry = await ethers.getContractFactory("BonzaiSkillRegistry");
      await expect(
        BonzaiSkillRegistry.deploy(await token.getAddress(), treasury.address, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(BonzaiSkillRegistry, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. SKILL REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Skill Registration", function () {
    it("should register a valid skill", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      const skill = await registry.getSkill(skillId);
      expect(skill.id).to.equal(skillId);
      expect(skill.author).to.equal(author1.address);
      expect(skill.name).to.equal("TestSkill");
      expect(skill.version).to.equal("1.0.0");
      expect(skill.category).to.equal("education");
      expect(skill.ipfsHash).to.equal(VALID_IPFS_HASH);
      expect(skill.purchasePrice).to.equal(SKILL_PURCHASE_PRICE);
      expect(skill.runningFee).to.equal(SKILL_RUNNING_FEE);
      expect(skill.isActive).to.be.true;
      expect(skill.isVerified).to.be.false;
      expect(skill.totalPurchases).to.equal(0);
      expect(skill.totalExecutions).to.equal(0);
      expect(skill.totalRevenue).to.equal(0);
    });

    it("should return the generated skill ID", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const expectedId = await registry.generateSkillId("TestSkill", "1.0.0", author1.address);

      const { skillId } = await registerDefaultSkill(registry, author1);
      expect(skillId).to.equal(expectedId);
    });

    it("should increment total skills count", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await registerDefaultSkill(registry, author1);
      expect(await registry.getTotalSkills()).to.equal(1);
    });

    it("should track author skills", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      const authorSkillIds = await registry.getSkillsByAuthor(author1.address);
      expect(authorSkillIds.length).to.equal(1);
      expect(authorSkillIds[0]).to.equal(skillId);
    });

    it("should allow registering a free skill (purchasePrice = 0)", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1, { purchasePrice: 0n });

      const skill = await registry.getSkill(skillId);
      expect(skill.purchasePrice).to.equal(0);
    });

    it("should allow registering a skill with no running fee", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1, { runningFee: 0n });

      const skill = await registry.getSkill(skillId);
      expect(skill.runningFee).to.equal(0);
    });

    it("should allow multiple authors to register skills", async function () {
      const { registry, author1, author2 } = await loadFixture(deploySkillRegistry);
      await registerDefaultSkill(registry, author1);
      await registerDefaultSkill(registry, author2);
      expect(await registry.getTotalSkills()).to.equal(2);
    });

    it("should allow same author to register multiple different skills", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await registerDefaultSkill(registry, author1, { name: "Skill1" });
      await registerDefaultSkill(registry, author1, { name: "Skill2" });

      const authorSkillIds = await registry.getSkillsByAuthor(author1.address);
      expect(authorSkillIds.length).to.equal(2);
    });

    it("should revert on empty name", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await expect(
        registry.connect(author1).registerSkill("", "1.0.0", "education", VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
      ).to.be.revertedWithCustomError(registry, "EmptyString");
    });

    it("should revert on empty version", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await expect(
        registry.connect(author1).registerSkill("TestSkill", "", "education", VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
      ).to.be.revertedWithCustomError(registry, "EmptyString");
    });

    it("should revert on empty category", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await expect(
        registry.connect(author1).registerSkill("TestSkill", "1.0.0", "", VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
      ).to.be.revertedWithCustomError(registry, "EmptyString");
    });

    it("should revert on invalid category", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await expect(
        registry.connect(author1).registerSkill("TestSkill", "1.0.0", "invalidcat", VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
      ).to.be.revertedWithCustomError(registry, "InvalidCategory")
        .withArgs("invalidcat");
    });

    it("should revert on invalid IPFS hash (too short)", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await expect(
        registry.connect(author1).registerSkill("TestSkill", "1.0.0", "education", SHORT_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
      ).to.be.revertedWithCustomError(registry, "InvalidIPFSHash");
    });

    it("should revert on running fee too high", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const tooHighFee = ethers.parseEther("10001"); // > 10000
      await expect(
        registry.connect(author1).registerSkill("TestSkill", "1.0.0", "education", VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, tooHighFee)
      ).to.be.revertedWithCustomError(registry, "RunningFeeTooHigh")
        .withArgs(tooHighFee, ethers.parseEther("10000"));
    });

    it("should revert on duplicate skill ID", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await registerDefaultSkill(registry, author1);

      // Same name + version + author = same ID
      await expect(
        registry.connect(author1).registerSkill("TestSkill", "1.0.0", "education", VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
      ).to.be.revertedWithCustomError(registry, "SkillAlreadyExists");
    });

    it("should allow same name/version from different authors (different ID)", async function () {
      const { registry, author1, author2 } = await loadFixture(deploySkillRegistry);
      await registerDefaultSkill(registry, author1);

      // Same name+version but different author = different ID, should succeed
      await expect(
        registry.connect(author2).registerSkill("TestSkill", "1.0.0", "education", VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
      ).to.not.be.reverted;
    });

    it("should revert when author exceeds MAX_SKILLS_PER_AUTHOR", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);

      // Register 100 skills (the maximum)
      for (let i = 0; i < 100; i++) {
        await registry.connect(author1).registerSkill(
          `Skill${i}`,
          "1.0.0",
          "education",
          VALID_IPFS_HASH,
          SKILL_PURCHASE_PRICE,
          SKILL_RUNNING_FEE
        );
      }

      // 101st should revert
      await expect(
        registry.connect(author1).registerSkill("Skill100", "1.0.0", "education", VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
      ).to.be.revertedWithCustomError(registry, "TooManySkills")
        .withArgs(author1.address, 100);
    });

    it("should revert when contract is paused", async function () {
      const { registry, owner, author1 } = await loadFixture(deploySkillRegistry);
      await registry.connect(owner).pause();
      await expect(
        registry.connect(author1).registerSkill("TestSkill", "1.0.0", "education", VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
      ).to.be.revertedWithCustomError(registry, "EnforcedPause");
    });

    it("should set createdAt and updatedAt timestamps", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      const skill = await registry.getSkill(skillId);
      expect(skill.createdAt).to.be.gt(0);
      expect(skill.updatedAt).to.equal(skill.createdAt);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. CATEGORY VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Category Validation", function () {
    for (const category of VALID_CATEGORIES) {
      it(`should accept valid category: "${category}"`, async function () {
        const { registry, author1 } = await loadFixture(deploySkillRegistry);
        await expect(
          registry.connect(author1).registerSkill(
            `${category}Skill`,
            "1.0.0",
            category,
            VALID_IPFS_HASH,
            SKILL_PURCHASE_PRICE,
            SKILL_RUNNING_FEE
          )
        ).to.not.be.reverted;
      });
    }

    it("should reject invalid category 'gaming'", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await expect(
        registry.connect(author1).registerSkill("TestSkill", "1.0.0", "gaming", VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
      ).to.be.revertedWithCustomError(registry, "InvalidCategory")
        .withArgs("gaming");
    });

    it("should reject category with wrong casing 'Education'", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      await expect(
        registry.connect(author1).registerSkill("TestSkill", "1.0.0", "Education", VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
      ).to.be.revertedWithCustomError(registry, "InvalidCategory")
        .withArgs("Education");
    });

    it("should return false for non-initialized category in validCategories mapping", async function () {
      const { registry } = await loadFixture(deploySkillRegistry);
      expect(await registry.validCategories("nonexistent")).to.be.false;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. SKILL UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Skill Update", function () {
    it("should allow author to update their skill", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      const newIpfsHash = "QmUpdatedHash12345678";
      const newPrice = ethers.parseEther("0.02");
      const newFee = ethers.parseEther("20");

      await registry.connect(author1).updateSkill(skillId, newIpfsHash, newPrice, newFee);

      const skill = await registry.getSkill(skillId);
      expect(skill.ipfsHash).to.equal(newIpfsHash);
      expect(skill.purchasePrice).to.equal(newPrice);
      expect(skill.runningFee).to.equal(newFee);
    });

    it("should update the updatedAt timestamp", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      const skillBefore = await registry.getSkill(skillId);

      // Mine a block to advance time
      await ethers.provider.send("evm_increaseTime", [100]);
      await ethers.provider.send("evm_mine");

      await registry.connect(author1).updateSkill(skillId, VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE);

      const skillAfter = await registry.getSkill(skillId);
      expect(skillAfter.updatedAt).to.be.gt(skillBefore.updatedAt);
    });

    it("should revert when non-author tries to update", async function () {
      const { registry, author1, author2 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await expect(
        registry.connect(author2).updateSkill(skillId, VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
      ).to.be.revertedWithCustomError(registry, "NotAuthor")
        .withArgs(author2.address, author1.address);
    });

    it("should revert when skill does not exist", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const fakeSkillId = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));

      await expect(
        registry.connect(author1).updateSkill(fakeSkillId, VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
      ).to.be.revertedWithCustomError(registry, "SkillNotFound")
        .withArgs(fakeSkillId);
    });

    it("should revert on invalid IPFS hash in update", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await expect(
        registry.connect(author1).updateSkill(skillId, SHORT_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
      ).to.be.revertedWithCustomError(registry, "InvalidIPFSHash");
    });

    it("should revert on running fee too high in update", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      const tooHighFee = ethers.parseEther("10001");
      await expect(
        registry.connect(author1).updateSkill(skillId, VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, tooHighFee)
      ).to.be.revertedWithCustomError(registry, "RunningFeeTooHigh")
        .withArgs(tooHighFee, ethers.parseEther("10000"));
    });

    it("should emit SkillUpdated event", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      const newIpfsHash = "QmUpdatedHash12345678";
      const newPrice = ethers.parseEther("0.05");
      const newFee = ethers.parseEther("50");

      await expect(
        registry.connect(author1).updateSkill(skillId, newIpfsHash, newPrice, newFee)
      )
        .to.emit(registry, "SkillUpdated")
        .withArgs(skillId, newIpfsHash, newPrice, newFee, (v) => v > 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. SKILL ACTIVATION / DEACTIVATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Skill Activation / Deactivation", function () {
    it("should allow author to deactivate their skill", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(author1).deactivateSkill(skillId);

      const skill = await registry.getSkill(skillId);
      expect(skill.isActive).to.be.false;
    });

    it("should allow author to reactivate their skill", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(author1).deactivateSkill(skillId);
      await registry.connect(author1).reactivateSkill(skillId);

      const skill = await registry.getSkill(skillId);
      expect(skill.isActive).to.be.true;
    });

    it("should emit SkillStatusChanged on deactivation", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await expect(registry.connect(author1).deactivateSkill(skillId))
        .to.emit(registry, "SkillStatusChanged")
        .withArgs(skillId, false, (v) => v > 0);
    });

    it("should emit SkillStatusChanged on reactivation", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(author1).deactivateSkill(skillId);

      await expect(registry.connect(author1).reactivateSkill(skillId))
        .to.emit(registry, "SkillStatusChanged")
        .withArgs(skillId, true, (v) => v > 0);
    });

    it("should revert when non-author tries to deactivate", async function () {
      const { registry, author1, author2 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await expect(
        registry.connect(author2).deactivateSkill(skillId)
      ).to.be.revertedWithCustomError(registry, "NotAuthor")
        .withArgs(author2.address, author1.address);
    });

    it("should revert when non-author tries to reactivate", async function () {
      const { registry, author1, author2 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(author1).deactivateSkill(skillId);

      await expect(
        registry.connect(author2).reactivateSkill(skillId)
      ).to.be.revertedWithCustomError(registry, "NotAuthor")
        .withArgs(author2.address, author1.address);
    });

    it("should revert when deactivating a non-existent skill", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const fakeSkillId = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));

      await expect(
        registry.connect(author1).deactivateSkill(fakeSkillId)
      ).to.be.revertedWithCustomError(registry, "SkillNotFound")
        .withArgs(fakeSkillId);
    });

    it("should revert when reactivating a non-existent skill", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const fakeSkillId = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));

      await expect(
        registry.connect(author1).reactivateSkill(fakeSkillId)
      ).to.be.revertedWithCustomError(registry, "SkillNotFound")
        .withArgs(fakeSkillId);
    });

    it("should update updatedAt on deactivation", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      const skillBefore = await registry.getSkill(skillId);

      await ethers.provider.send("evm_increaseTime", [100]);
      await ethers.provider.send("evm_mine");

      await registry.connect(author1).deactivateSkill(skillId);

      const skillAfter = await registry.getSkill(skillId);
      expect(skillAfter.updatedAt).to.be.gt(skillBefore.updatedAt);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. SKILL PURCHASE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Skill Purchase", function () {
    it("should purchase a skill with correct ETH payment", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      expect(await registry.hasPurchased(buyer1.address, skillId)).to.be.true;
    });

    it("should split fees 80/20 between ownership and treasury", async function () {
      const { registry, mockOwnership, treasury, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      const treasuryBalBefore = await ethers.provider.getBalance(treasury.address);
      const ownershipBalBefore = await ethers.provider.getBalance(await mockOwnership.getAddress());

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      const treasuryBalAfter = await ethers.provider.getBalance(treasury.address);
      const ownershipBalAfter = await ethers.provider.getBalance(await mockOwnership.getAddress());

      const expectedCoOwnerShare = (SKILL_PURCHASE_PRICE * 8000n) / 10000n; // 80%
      const expectedPlatformShare = SKILL_PURCHASE_PRICE - expectedCoOwnerShare; // 20%

      expect(ownershipBalAfter - ownershipBalBefore).to.equal(expectedCoOwnerShare);
      expect(treasuryBalAfter - treasuryBalBefore).to.equal(expectedPlatformShare);
    });

    it("should update skill totalPurchases and totalRevenue", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      const skill = await registry.getSkill(skillId);
      expect(skill.totalPurchases).to.equal(1);
      expect(skill.totalRevenue).to.equal(SKILL_PURCHASE_PRICE);
    });

    it("should update totalPlatformFeesETH", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      const expectedPlatformShare = SKILL_PURCHASE_PRICE - (SKILL_PURCHASE_PRICE * 8000n) / 10000n;
      expect(await registry.totalPlatformFeesETH()).to.equal(expectedPlatformShare);
    });

    it("should call distributeRevenue on ownership contract", async function () {
      const { registry, mockOwnership, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      const expectedCoOwnerShare = (SKILL_PURCHASE_PRICE * 8000n) / 10000n;
      expect(await mockOwnership.lastDistributedSkillId()).to.equal(skillId);
      expect(await mockOwnership.lastDistributedAmount()).to.equal(expectedCoOwnerShare);
    });

    it("should allow free skill purchase with 0 ETH", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1, { purchasePrice: 0n });

      await registry.connect(buyer1).purchaseSkill(skillId, { value: 0 });

      expect(await registry.hasPurchased(buyer1.address, skillId)).to.be.true;
    });

    it("should not transfer any ETH for free skill purchase", async function () {
      const { registry, treasury, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1, { purchasePrice: 0n });

      const treasuryBalBefore = await ethers.provider.getBalance(treasury.address);
      await registry.connect(buyer1).purchaseSkill(skillId, { value: 0 });
      const treasuryBalAfter = await ethers.provider.getBalance(treasury.address);

      expect(treasuryBalAfter).to.equal(treasuryBalBefore);
    });

    it("should increment totalPurchases even for free skills", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1, { purchasePrice: 0n });

      await registry.connect(buyer1).purchaseSkill(skillId, { value: 0 });

      const skill = await registry.getSkill(skillId);
      expect(skill.totalPurchases).to.equal(1);
      expect(skill.totalRevenue).to.equal(0);
    });

    it("should revert on already purchased", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE })
      ).to.be.revertedWithCustomError(registry, "AlreadyPurchased")
        .withArgs(buyer1.address, skillId);
    });

    it("should revert on incorrect payment (too little)", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      const wrongAmount = ethers.parseEther("0.005");
      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, { value: wrongAmount })
      ).to.be.revertedWithCustomError(registry, "IncorrectPayment")
        .withArgs(wrongAmount, SKILL_PURCHASE_PRICE);
    });

    it("should revert on incorrect payment (too much)", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      const wrongAmount = ethers.parseEther("0.02");
      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, { value: wrongAmount })
      ).to.be.revertedWithCustomError(registry, "IncorrectPayment")
        .withArgs(wrongAmount, SKILL_PURCHASE_PRICE);
    });

    it("should revert when purchasing an inactive skill", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(author1).deactivateSkill(skillId);

      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE })
      ).to.be.revertedWithCustomError(registry, "SkillNotActive")
        .withArgs(skillId);
    });

    it("should revert when purchasing a non-existent skill", async function () {
      const { registry, buyer1 } = await loadFixture(deploySkillRegistry);
      const fakeSkillId = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));

      await expect(
        registry.connect(buyer1).purchaseSkill(fakeSkillId, { value: SKILL_PURCHASE_PRICE })
      ).to.be.revertedWithCustomError(registry, "SkillNotFound")
        .withArgs(fakeSkillId);
    });

    it("should revert when contract is paused", async function () {
      const { registry, owner, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(owner).pause();

      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE })
      ).to.be.revertedWithCustomError(registry, "EnforcedPause");
    });

    it("should allow multiple buyers to purchase the same skill", async function () {
      const { registry, author1, buyer1, buyer2 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });
      await registry.connect(buyer2).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      expect(await registry.hasPurchased(buyer1.address, skillId)).to.be.true;
      expect(await registry.hasPurchased(buyer2.address, skillId)).to.be.true;

      const skill = await registry.getSkill(skillId);
      expect(skill.totalPurchases).to.equal(2);
      expect(skill.totalRevenue).to.equal(SKILL_PURCHASE_PRICE * 2n);
    });

    it("should emit SkillPurchased event with correct args for paid skill", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      const expectedCoOwnerShare = (SKILL_PURCHASE_PRICE * 8000n) / 10000n;
      const expectedPlatformShare = SKILL_PURCHASE_PRICE - expectedCoOwnerShare;

      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE })
      )
        .to.emit(registry, "SkillPurchased")
        .withArgs(
          skillId,
          buyer1.address,
          author1.address,
          SKILL_PURCHASE_PRICE,
          expectedCoOwnerShare,
          expectedPlatformShare,
          (v) => v > 0
        );
    });

    it("should emit SkillPurchased event with zero amounts for free skill", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1, { purchasePrice: 0n });

      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, { value: 0 })
      )
        .to.emit(registry, "SkillPurchased")
        .withArgs(skillId, buyer1.address, author1.address, 0, 0, 0, (v) => v > 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. OWNERSHIP FALLBACK
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Ownership Fallback", function () {
    it("should send co-owner share to treasury when ownership contract reverts", async function () {
      const { registry, mockOwnership, treasury, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      // Tell the mock ownership contract to revert
      await mockOwnership.setRevert(true);

      const treasuryBalBefore = await ethers.provider.getBalance(treasury.address);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      const treasuryBalAfter = await ethers.provider.getBalance(treasury.address);

      // Treasury should receive both co-owner share (80%) + platform share (20%) = 100%
      expect(treasuryBalAfter - treasuryBalBefore).to.equal(SKILL_PURCHASE_PRICE);
    });

    it("should emit CoOwnerShareFallbackToTreasury event when ownership reverts", async function () {
      const { registry, mockOwnership, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await mockOwnership.setRevert(true);

      const expectedCoOwnerShare = (SKILL_PURCHASE_PRICE * 8000n) / 10000n;

      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE })
      )
        .to.emit(registry, "CoOwnerShareFallbackToTreasury")
        .withArgs(skillId, expectedCoOwnerShare);
    });

    it("should still mark skill as purchased when ownership reverts", async function () {
      const { registry, mockOwnership, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await mockOwnership.setRevert(true);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      expect(await registry.hasPurchased(buyer1.address, skillId)).to.be.true;
    });

    it("should still emit SkillPurchased event when ownership reverts", async function () {
      const { registry, mockOwnership, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await mockOwnership.setRevert(true);

      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE })
      ).to.emit(registry, "SkillPurchased");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. SKILL EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Skill Execution", function () {
    it("should record execution for a purchased skill with running fee", async function () {
      const { registry, bonzaiToken, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      // Purchase the skill
      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      // Mint BONZAI to buyer and approve
      await bonzaiToken.mint(buyer1.address, ethers.parseEther("1000"));
      await bonzaiToken.connect(buyer1).approve(await registry.getAddress(), ethers.MaxUint256);

      await registry.connect(buyer1).recordExecution(skillId);

      const skill = await registry.getSkill(skillId);
      expect(skill.totalExecutions).to.equal(1);
    });

    it("should split running fee 80/20 in BONZAI tokens", async function () {
      const { registry, bonzaiToken, treasury, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      await bonzaiToken.mint(buyer1.address, ethers.parseEther("1000"));
      await bonzaiToken.connect(buyer1).approve(await registry.getAddress(), ethers.MaxUint256);

      const authorBalBefore = await bonzaiToken.balanceOf(author1.address);
      const treasuryBalBefore = await bonzaiToken.balanceOf(treasury.address);

      await registry.connect(buyer1).recordExecution(skillId);

      const authorBalAfter = await bonzaiToken.balanceOf(author1.address);
      const treasuryBalAfter = await bonzaiToken.balanceOf(treasury.address);

      const expectedAuthorShare = (SKILL_RUNNING_FEE * 8000n) / 10000n;
      const expectedPlatformShare = SKILL_RUNNING_FEE - expectedAuthorShare;

      expect(authorBalAfter - authorBalBefore).to.equal(expectedAuthorShare);
      expect(treasuryBalAfter - treasuryBalBefore).to.equal(expectedPlatformShare);
    });

    it("should update totalPlatformFeesBONZAI", async function () {
      const { registry, bonzaiToken, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      await bonzaiToken.mint(buyer1.address, ethers.parseEther("1000"));
      await bonzaiToken.connect(buyer1).approve(await registry.getAddress(), ethers.MaxUint256);

      await registry.connect(buyer1).recordExecution(skillId);

      const expectedPlatformShare = SKILL_RUNNING_FEE - (SKILL_RUNNING_FEE * 8000n) / 10000n;
      expect(await registry.totalPlatformFeesBONZAI()).to.equal(expectedPlatformShare);
    });

    it("should allow execution of a free skill (purchasePrice = 0) without purchasing", async function () {
      const { registry, bonzaiToken, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1, { purchasePrice: 0n });

      // buyer1 has NOT purchased, but the skill is free so execution should work
      await bonzaiToken.mint(buyer1.address, ethers.parseEther("1000"));
      await bonzaiToken.connect(buyer1).approve(await registry.getAddress(), ethers.MaxUint256);

      await registry.connect(buyer1).recordExecution(skillId);

      const skill = await registry.getSkill(skillId);
      expect(skill.totalExecutions).to.equal(1);
    });

    it("should allow execution with zero running fee (no BONZAI transfer)", async function () {
      const { registry, bonzaiToken, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1, { runningFee: 0n });

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      const buyerBalBefore = await bonzaiToken.balanceOf(buyer1.address);

      await registry.connect(buyer1).recordExecution(skillId);

      const buyerBalAfter = await bonzaiToken.balanceOf(buyer1.address);
      expect(buyerBalAfter).to.equal(buyerBalBefore); // no tokens transferred
    });

    it("should revert when paid skill is not purchased", async function () {
      const { registry, bonzaiToken, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await bonzaiToken.mint(buyer1.address, ethers.parseEther("1000"));
      await bonzaiToken.connect(buyer1).approve(await registry.getAddress(), ethers.MaxUint256);

      await expect(
        registry.connect(buyer1).recordExecution(skillId)
      ).to.be.revertedWithCustomError(registry, "NotPurchased")
        .withArgs(buyer1.address, skillId);
    });

    it("should revert when skill is inactive", async function () {
      const { registry, bonzaiToken, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });
      await registry.connect(author1).deactivateSkill(skillId);

      await bonzaiToken.mint(buyer1.address, ethers.parseEther("1000"));
      await bonzaiToken.connect(buyer1).approve(await registry.getAddress(), ethers.MaxUint256);

      await expect(
        registry.connect(buyer1).recordExecution(skillId)
      ).to.be.revertedWithCustomError(registry, "SkillNotActive")
        .withArgs(skillId);
    });

    it("should revert when skill does not exist", async function () {
      const { registry, buyer1 } = await loadFixture(deploySkillRegistry);
      const fakeSkillId = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));

      await expect(
        registry.connect(buyer1).recordExecution(fakeSkillId)
      ).to.be.revertedWithCustomError(registry, "SkillNotFound")
        .withArgs(fakeSkillId);
    });

    it("should revert when contract is paused", async function () {
      const { registry, bonzaiToken, owner, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      await bonzaiToken.mint(buyer1.address, ethers.parseEther("1000"));
      await bonzaiToken.connect(buyer1).approve(await registry.getAddress(), ethers.MaxUint256);

      await registry.connect(owner).pause();

      await expect(
        registry.connect(buyer1).recordExecution(skillId)
      ).to.be.revertedWithCustomError(registry, "EnforcedPause");
    });

    it("should emit SkillExecuted event with fee details", async function () {
      const { registry, bonzaiToken, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      await bonzaiToken.mint(buyer1.address, ethers.parseEther("1000"));
      await bonzaiToken.connect(buyer1).approve(await registry.getAddress(), ethers.MaxUint256);

      const expectedAuthorShare = (SKILL_RUNNING_FEE * 8000n) / 10000n;
      const expectedPlatformShare = SKILL_RUNNING_FEE - expectedAuthorShare;

      await expect(registry.connect(buyer1).recordExecution(skillId))
        .to.emit(registry, "SkillExecuted")
        .withArgs(
          skillId,
          buyer1.address,
          author1.address,
          SKILL_RUNNING_FEE,
          expectedAuthorShare,
          expectedPlatformShare,
          (v) => v > 0
        );
    });

    it("should emit SkillExecuted event with zero amounts for no-fee skill", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1, { runningFee: 0n });

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      await expect(registry.connect(buyer1).recordExecution(skillId))
        .to.emit(registry, "SkillExecuted")
        .withArgs(skillId, buyer1.address, author1.address, 0, 0, 0, (v) => v > 0);
    });

    it("should allow multiple executions by the same user", async function () {
      const { registry, bonzaiToken, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      await bonzaiToken.mint(buyer1.address, ethers.parseEther("1000"));
      await bonzaiToken.connect(buyer1).approve(await registry.getAddress(), ethers.MaxUint256);

      await registry.connect(buyer1).recordExecution(skillId);
      await registry.connect(buyer1).recordExecution(skillId);
      await registry.connect(buyer1).recordExecution(skillId);

      const skill = await registry.getSkill(skillId);
      expect(skill.totalExecutions).to.equal(3);
    });

    it("should deduct BONZAI from the executor's balance", async function () {
      const { registry, bonzaiToken, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      const initialBalance = ethers.parseEther("1000");
      await bonzaiToken.mint(buyer1.address, initialBalance);
      await bonzaiToken.connect(buyer1).approve(await registry.getAddress(), ethers.MaxUint256);

      await registry.connect(buyer1).recordExecution(skillId);

      const finalBalance = await bonzaiToken.balanceOf(buyer1.address);
      expect(finalBalance).to.equal(initialBalance - SKILL_RUNNING_FEE);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. ADMIN
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Admin", function () {
    describe("verifySkill", function () {
      it("should verify a skill", async function () {
        const { registry, owner, author1 } = await loadFixture(deploySkillRegistry);
        const { skillId } = await registerDefaultSkill(registry, author1);

        await registry.connect(owner).verifySkill(skillId);

        const skill = await registry.getSkill(skillId);
        expect(skill.isVerified).to.be.true;
      });

      it("should emit SkillVerificationChanged event on verify", async function () {
        const { registry, owner, author1 } = await loadFixture(deploySkillRegistry);
        const { skillId } = await registerDefaultSkill(registry, author1);

        await expect(registry.connect(owner).verifySkill(skillId))
          .to.emit(registry, "SkillVerificationChanged")
          .withArgs(skillId, true, (v) => v > 0);
      });

      it("should revert when non-owner tries to verify", async function () {
        const { registry, author1 } = await loadFixture(deploySkillRegistry);
        const { skillId } = await registerDefaultSkill(registry, author1);

        await expect(
          registry.connect(author1).verifySkill(skillId)
        ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      });

      it("should revert when verifying non-existent skill", async function () {
        const { registry, owner } = await loadFixture(deploySkillRegistry);
        const fakeSkillId = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));

        await expect(
          registry.connect(owner).verifySkill(fakeSkillId)
        ).to.be.revertedWithCustomError(registry, "SkillNotFound");
      });

      it("should update updatedAt on verify", async function () {
        const { registry, owner, author1 } = await loadFixture(deploySkillRegistry);
        const { skillId } = await registerDefaultSkill(registry, author1);

        const skillBefore = await registry.getSkill(skillId);

        await ethers.provider.send("evm_increaseTime", [100]);
        await ethers.provider.send("evm_mine");

        await registry.connect(owner).verifySkill(skillId);

        const skillAfter = await registry.getSkill(skillId);
        expect(skillAfter.updatedAt).to.be.gt(skillBefore.updatedAt);
      });
    });

    describe("unverifySkill", function () {
      it("should unverify a skill", async function () {
        const { registry, owner, author1 } = await loadFixture(deploySkillRegistry);
        const { skillId } = await registerDefaultSkill(registry, author1);

        await registry.connect(owner).verifySkill(skillId);
        await registry.connect(owner).unverifySkill(skillId);

        const skill = await registry.getSkill(skillId);
        expect(skill.isVerified).to.be.false;
      });

      it("should emit SkillVerificationChanged event on unverify", async function () {
        const { registry, owner, author1 } = await loadFixture(deploySkillRegistry);
        const { skillId } = await registerDefaultSkill(registry, author1);

        await registry.connect(owner).verifySkill(skillId);

        await expect(registry.connect(owner).unverifySkill(skillId))
          .to.emit(registry, "SkillVerificationChanged")
          .withArgs(skillId, false, (v) => v > 0);
      });

      it("should revert when non-owner tries to unverify", async function () {
        const { registry, owner, author1 } = await loadFixture(deploySkillRegistry);
        const { skillId } = await registerDefaultSkill(registry, author1);

        await registry.connect(owner).verifySkill(skillId);

        await expect(
          registry.connect(author1).unverifySkill(skillId)
        ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      });
    });

    describe("adminDeactivateSkill", function () {
      it("should deactivate and unverify a skill", async function () {
        const { registry, owner, author1 } = await loadFixture(deploySkillRegistry);
        const { skillId } = await registerDefaultSkill(registry, author1);

        await registry.connect(owner).verifySkill(skillId);
        await registry.connect(owner).adminDeactivateSkill(skillId);

        const skill = await registry.getSkill(skillId);
        expect(skill.isActive).to.be.false;
        expect(skill.isVerified).to.be.false;
      });

      it("should emit SkillStatusChanged event", async function () {
        const { registry, owner, author1 } = await loadFixture(deploySkillRegistry);
        const { skillId } = await registerDefaultSkill(registry, author1);

        await expect(registry.connect(owner).adminDeactivateSkill(skillId))
          .to.emit(registry, "SkillStatusChanged")
          .withArgs(skillId, false, (v) => v > 0);
      });

      it("should revert when non-owner tries to admin deactivate", async function () {
        const { registry, author1 } = await loadFixture(deploySkillRegistry);
        const { skillId } = await registerDefaultSkill(registry, author1);

        await expect(
          registry.connect(author1).adminDeactivateSkill(skillId)
        ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      });

      it("should revert when admin deactivating non-existent skill", async function () {
        const { registry, owner } = await loadFixture(deploySkillRegistry);
        const fakeSkillId = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));

        await expect(
          registry.connect(owner).adminDeactivateSkill(fakeSkillId)
        ).to.be.revertedWithCustomError(registry, "SkillNotFound");
      });
    });

    describe("setTreasury", function () {
      it("should update the treasury address", async function () {
        const { registry, owner, buyer1 } = await loadFixture(deploySkillRegistry);
        await registry.connect(owner).setTreasury(buyer1.address);
        expect(await registry.treasury()).to.equal(buyer1.address);
      });

      it("should emit TreasuryUpdated event", async function () {
        const { registry, owner, treasury, buyer1 } = await loadFixture(deploySkillRegistry);

        await expect(registry.connect(owner).setTreasury(buyer1.address))
          .to.emit(registry, "TreasuryUpdated")
          .withArgs(treasury.address, buyer1.address);
      });

      it("should revert when setting zero address", async function () {
        const { registry, owner } = await loadFixture(deploySkillRegistry);
        await expect(
          registry.connect(owner).setTreasury(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(registry, "ZeroAddress");
      });

      it("should revert when non-owner calls", async function () {
        const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
        await expect(
          registry.connect(author1).setTreasury(buyer1.address)
        ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      });
    });

    describe("setBonzaiToken", function () {
      it("should update the BONZAI token address", async function () {
        const { registry, owner, buyer1 } = await loadFixture(deploySkillRegistry);
        await registry.connect(owner).setBonzaiToken(buyer1.address);
        expect(await registry.bonzaiToken()).to.equal(buyer1.address);
      });

      it("should emit BonzaiTokenUpdated event", async function () {
        const { registry, bonzaiToken, owner, buyer1 } = await loadFixture(deploySkillRegistry);

        await expect(registry.connect(owner).setBonzaiToken(buyer1.address))
          .to.emit(registry, "BonzaiTokenUpdated")
          .withArgs(await bonzaiToken.getAddress(), buyer1.address);
      });

      it("should revert when setting zero address", async function () {
        const { registry, owner } = await loadFixture(deploySkillRegistry);
        await expect(
          registry.connect(owner).setBonzaiToken(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(registry, "ZeroAddress");
      });

      it("should revert when non-owner calls", async function () {
        const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
        await expect(
          registry.connect(author1).setBonzaiToken(buyer1.address)
        ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      });
    });

    describe("setSkillOwnershipContract", function () {
      it("should update the skill ownership contract address", async function () {
        const { registry, owner, buyer1 } = await loadFixture(deploySkillRegistry);
        await registry.connect(owner).setSkillOwnershipContract(buyer1.address);
        expect(await registry.skillOwnershipContract()).to.equal(buyer1.address);
      });

      it("should emit SkillOwnershipContractUpdated event", async function () {
        const { registry, mockOwnership, owner, buyer1 } = await loadFixture(deploySkillRegistry);

        await expect(registry.connect(owner).setSkillOwnershipContract(buyer1.address))
          .to.emit(registry, "SkillOwnershipContractUpdated")
          .withArgs(await mockOwnership.getAddress(), buyer1.address);
      });

      it("should revert when setting zero address", async function () {
        const { registry, owner } = await loadFixture(deploySkillRegistry);
        await expect(
          registry.connect(owner).setSkillOwnershipContract(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(registry, "ZeroAddress");
      });

      it("should revert when non-owner calls", async function () {
        const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
        await expect(
          registry.connect(author1).setSkillOwnershipContract(buyer1.address)
        ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      });
    });

    describe("pause / unpause", function () {
      it("should pause the contract", async function () {
        const { registry, owner } = await loadFixture(deploySkillRegistry);
        await registry.connect(owner).pause();
        expect(await registry.paused()).to.be.true;
      });

      it("should unpause the contract", async function () {
        const { registry, owner } = await loadFixture(deploySkillRegistry);
        await registry.connect(owner).pause();
        await registry.connect(owner).unpause();
        expect(await registry.paused()).to.be.false;
      });

      it("should revert when non-owner tries to pause", async function () {
        const { registry, author1 } = await loadFixture(deploySkillRegistry);
        await expect(
          registry.connect(author1).pause()
        ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      });

      it("should revert when non-owner tries to unpause", async function () {
        const { registry, owner, author1 } = await loadFixture(deploySkillRegistry);
        await registry.connect(owner).pause();
        await expect(
          registry.connect(author1).unpause()
        ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      });

      it("should block registration when paused", async function () {
        const { registry, owner, author1 } = await loadFixture(deploySkillRegistry);
        await registry.connect(owner).pause();
        await expect(
          registry.connect(author1).registerSkill("TestSkill", "1.0.0", "education", VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
        ).to.be.revertedWithCustomError(registry, "EnforcedPause");
      });

      it("should allow registration after unpause", async function () {
        const { registry, owner, author1 } = await loadFixture(deploySkillRegistry);
        await registry.connect(owner).pause();
        await registry.connect(owner).unpause();
        await expect(
          registry.connect(author1).registerSkill("TestSkill", "1.0.0", "education", VALID_IPFS_HASH, SKILL_PURCHASE_PRICE, SKILL_RUNNING_FEE)
        ).to.not.be.reverted;
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. VIEW FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("View Functions", function () {
    describe("getSkill", function () {
      it("should return full skill details", async function () {
        const { registry, author1 } = await loadFixture(deploySkillRegistry);
        const { skillId } = await registerDefaultSkill(registry, author1);

        const skill = await registry.getSkill(skillId);
        expect(skill.id).to.equal(skillId);
        expect(skill.author).to.equal(author1.address);
        expect(skill.name).to.equal("TestSkill");
        expect(skill.version).to.equal("1.0.0");
        expect(skill.category).to.equal("education");
        expect(skill.ipfsHash).to.equal(VALID_IPFS_HASH);
        expect(skill.purchasePrice).to.equal(SKILL_PURCHASE_PRICE);
        expect(skill.runningFee).to.equal(SKILL_RUNNING_FEE);
        expect(skill.isActive).to.be.true;
        expect(skill.isVerified).to.be.false;
        expect(skill.totalPurchases).to.equal(0);
        expect(skill.totalExecutions).to.equal(0);
        expect(skill.totalRevenue).to.equal(0);
        expect(skill.createdAt).to.be.gt(0);
        expect(skill.updatedAt).to.be.gt(0);
      });

      it("should return empty skill for non-existent ID", async function () {
        const { registry } = await loadFixture(deploySkillRegistry);
        const fakeSkillId = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));

        const skill = await registry.getSkill(fakeSkillId);
        expect(skill.author).to.equal(ethers.ZeroAddress);
        expect(skill.name).to.equal("");
      });
    });

    describe("getSkillsByAuthor", function () {
      it("should return all skills by an author", async function () {
        const { registry, author1 } = await loadFixture(deploySkillRegistry);
        const { skillId: id1 } = await registerDefaultSkill(registry, author1, { name: "Skill1" });
        const { skillId: id2 } = await registerDefaultSkill(registry, author1, { name: "Skill2" });
        const { skillId: id3 } = await registerDefaultSkill(registry, author1, { name: "Skill3" });

        const authorSkills = await registry.getSkillsByAuthor(author1.address);
        expect(authorSkills.length).to.equal(3);
        expect(authorSkills[0]).to.equal(id1);
        expect(authorSkills[1]).to.equal(id2);
        expect(authorSkills[2]).to.equal(id3);
      });

      it("should return empty array for author with no skills", async function () {
        const { registry, buyer1 } = await loadFixture(deploySkillRegistry);
        const authorSkills = await registry.getSkillsByAuthor(buyer1.address);
        expect(authorSkills.length).to.equal(0);
      });
    });

    describe("getTotalSkills", function () {
      it("should return correct total after multiple registrations", async function () {
        const { registry, author1, author2 } = await loadFixture(deploySkillRegistry);
        await registerDefaultSkill(registry, author1, { name: "S1" });
        await registerDefaultSkill(registry, author1, { name: "S2" });
        await registerDefaultSkill(registry, author2, { name: "S3" });

        expect(await registry.getTotalSkills()).to.equal(3);
      });
    });

    describe("getSkillsPaginated", function () {
      it("should return skills within page range", async function () {
        const { registry, author1 } = await loadFixture(deploySkillRegistry);
        const ids = [];
        for (let i = 0; i < 5; i++) {
          const { skillId } = await registerDefaultSkill(registry, author1, { name: `Skill${i}` });
          ids.push(skillId);
        }

        const page = await registry.getSkillsPaginated(1, 3);
        expect(page.length).to.equal(3);
        expect(page[0]).to.equal(ids[1]);
        expect(page[1]).to.equal(ids[2]);
        expect(page[2]).to.equal(ids[3]);
      });

      it("should return empty array when offset >= total", async function () {
        const { registry, author1 } = await loadFixture(deploySkillRegistry);
        await registerDefaultSkill(registry, author1);

        const page = await registry.getSkillsPaginated(10, 5);
        expect(page.length).to.equal(0);
      });

      it("should clamp limit when offset + limit > total", async function () {
        const { registry, author1 } = await loadFixture(deploySkillRegistry);
        for (let i = 0; i < 3; i++) {
          await registerDefaultSkill(registry, author1, { name: `Skill${i}` });
        }

        const page = await registry.getSkillsPaginated(1, 100);
        expect(page.length).to.equal(2); // only indices 1 and 2
      });

      it("should return all skills with offset 0 and large limit", async function () {
        const { registry, author1 } = await loadFixture(deploySkillRegistry);
        for (let i = 0; i < 3; i++) {
          await registerDefaultSkill(registry, author1, { name: `Skill${i}` });
        }

        const page = await registry.getSkillsPaginated(0, 100);
        expect(page.length).to.equal(3);
      });

      it("should return empty array when no skills exist", async function () {
        const { registry } = await loadFixture(deploySkillRegistry);
        const page = await registry.getSkillsPaginated(0, 10);
        expect(page.length).to.equal(0);
      });
    });

    describe("generateSkillId", function () {
      it("should generate deterministic ID from name, version, and author", async function () {
        const { registry, author1 } = await loadFixture(deploySkillRegistry);
        const id1 = await registry.generateSkillId("TestSkill", "1.0.0", author1.address);
        const id2 = await registry.generateSkillId("TestSkill", "1.0.0", author1.address);
        expect(id1).to.equal(id2);
      });

      it("should generate different IDs for different names", async function () {
        const { registry, author1 } = await loadFixture(deploySkillRegistry);
        const id1 = await registry.generateSkillId("Skill1", "1.0.0", author1.address);
        const id2 = await registry.generateSkillId("Skill2", "1.0.0", author1.address);
        expect(id1).to.not.equal(id2);
      });

      it("should generate different IDs for different versions", async function () {
        const { registry, author1 } = await loadFixture(deploySkillRegistry);
        const id1 = await registry.generateSkillId("TestSkill", "1.0.0", author1.address);
        const id2 = await registry.generateSkillId("TestSkill", "2.0.0", author1.address);
        expect(id1).to.not.equal(id2);
      });

      it("should generate different IDs for different authors", async function () {
        const { registry, author1, author2 } = await loadFixture(deploySkillRegistry);
        const id1 = await registry.generateSkillId("TestSkill", "1.0.0", author1.address);
        const id2 = await registry.generateSkillId("TestSkill", "1.0.0", author2.address);
        expect(id1).to.not.equal(id2);
      });

      it("should match the ID generated during registration", async function () {
        const { registry, author1 } = await loadFixture(deploySkillRegistry);
        const expectedId = await registry.generateSkillId("TestSkill", "1.0.0", author1.address);
        const { skillId } = await registerDefaultSkill(registry, author1);
        expect(skillId).to.equal(expectedId);
      });
    });

    describe("getStats", function () {
      it("should return correct stats after purchases and executions", async function () {
        const { registry, bonzaiToken, author1, buyer1 } = await loadFixture(deploySkillRegistry);
        const { skillId } = await registerDefaultSkill(registry, author1);

        // Purchase
        await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

        // Execute
        await bonzaiToken.mint(buyer1.address, ethers.parseEther("1000"));
        await bonzaiToken.connect(buyer1).approve(await registry.getAddress(), ethers.MaxUint256);
        await registry.connect(buyer1).recordExecution(skillId);

        const [totalSkills, feesETH, feesBONZAI] = await registry.getStats();

        expect(totalSkills).to.equal(1);

        const expectedPlatformETH = SKILL_PURCHASE_PRICE - (SKILL_PURCHASE_PRICE * 8000n) / 10000n;
        expect(feesETH).to.equal(expectedPlatformETH);

        const expectedPlatformBONZAI = SKILL_RUNNING_FEE - (SKILL_RUNNING_FEE * 8000n) / 10000n;
        expect(feesBONZAI).to.equal(expectedPlatformBONZAI);
      });

      it("should return zero stats initially", async function () {
        const { registry } = await loadFixture(deploySkillRegistry);
        const [totalSkills, feesETH, feesBONZAI] = await registry.getStats();
        expect(totalSkills).to.equal(0);
        expect(feesETH).to.equal(0);
        expect(feesBONZAI).to.equal(0);
      });
    });

    describe("userHasPurchased", function () {
      it("should return true for purchased skill", async function () {
        const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
        const { skillId } = await registerDefaultSkill(registry, author1);

        await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

        expect(await registry.userHasPurchased(buyer1.address, skillId)).to.be.true;
      });

      it("should return false for unpurchased skill", async function () {
        const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
        const { skillId } = await registerDefaultSkill(registry, author1);

        expect(await registry.userHasPurchased(buyer1.address, skillId)).to.be.false;
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. RECEIVE / FALLBACK
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Receive / Fallback", function () {
    it("should revert on direct ETH transfer (receive)", async function () {
      const { registry, buyer1 } = await loadFixture(deploySkillRegistry);

      await expect(
        buyer1.sendTransaction({
          to: await registry.getAddress(),
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(registry, "UseCorrectFunction");
    });

    it("should revert on fallback call with data", async function () {
      const { registry, buyer1 } = await loadFixture(deploySkillRegistry);

      await expect(
        buyer1.sendTransaction({
          to: await registry.getAddress(),
          value: ethers.parseEther("1"),
          data: "0x12345678",
        })
      ).to.be.revertedWithCustomError(registry, "UseCorrectFunction");
    });

    it("should revert on fallback call with data and no value", async function () {
      const { registry, buyer1 } = await loadFixture(deploySkillRegistry);

      await expect(
        buyer1.sendTransaction({
          to: await registry.getAddress(),
          value: 0,
          data: "0xdeadbeef",
        })
      ).to.be.revertedWithCustomError(registry, "UseCorrectFunction");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Events", function () {
    it("should emit SkillRegistered with all correct args", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);

      const name = "EventSkill";
      const version = "2.0.0";
      const category = "finance";
      const ipfsHash = "QmEventHash1234567890";
      const purchasePrice = ethers.parseEther("0.05");
      const runningFee = ethers.parseEther("25");

      const expectedId = await registry.generateSkillId(name, version, author1.address);

      await expect(
        registry.connect(author1).registerSkill(name, version, category, ipfsHash, purchasePrice, runningFee)
      )
        .to.emit(registry, "SkillRegistered")
        .withArgs(
          expectedId,
          author1.address,
          name,
          version,
          category,
          ipfsHash,
          purchasePrice,
          runningFee,
          (v) => v > 0
        );
    });

    it("should emit SkillUpdated with all correct args", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      const newHash = "QmNewHash1234567890123";
      const newPrice = ethers.parseEther("0.1");
      const newFee = ethers.parseEther("100");

      await expect(
        registry.connect(author1).updateSkill(skillId, newHash, newPrice, newFee)
      )
        .to.emit(registry, "SkillUpdated")
        .withArgs(skillId, newHash, newPrice, newFee, (v) => v > 0);
    });

    it("should emit SkillPurchased with all correct args", async function () {
      const { registry, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      const coOwnerShare = (SKILL_PURCHASE_PRICE * 8000n) / 10000n;
      const platformShare = SKILL_PURCHASE_PRICE - coOwnerShare;

      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE })
      )
        .to.emit(registry, "SkillPurchased")
        .withArgs(
          skillId,
          buyer1.address,
          author1.address,
          SKILL_PURCHASE_PRICE,
          coOwnerShare,
          platformShare,
          (v) => v > 0
        );
    });

    it("should emit SkillExecuted with all correct args", async function () {
      const { registry, bonzaiToken, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE });

      await bonzaiToken.mint(buyer1.address, ethers.parseEther("1000"));
      await bonzaiToken.connect(buyer1).approve(await registry.getAddress(), ethers.MaxUint256);

      const authorShare = (SKILL_RUNNING_FEE * 8000n) / 10000n;
      const platformShare = SKILL_RUNNING_FEE - authorShare;

      await expect(
        registry.connect(buyer1).recordExecution(skillId)
      )
        .to.emit(registry, "SkillExecuted")
        .withArgs(
          skillId,
          buyer1.address,
          author1.address,
          SKILL_RUNNING_FEE,
          authorShare,
          platformShare,
          (v) => v > 0
        );
    });

    it("should emit SkillVerificationChanged on verify", async function () {
      const { registry, owner, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await expect(registry.connect(owner).verifySkill(skillId))
        .to.emit(registry, "SkillVerificationChanged")
        .withArgs(skillId, true, (v) => v > 0);
    });

    it("should emit SkillVerificationChanged on unverify", async function () {
      const { registry, owner, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(owner).verifySkill(skillId);

      await expect(registry.connect(owner).unverifySkill(skillId))
        .to.emit(registry, "SkillVerificationChanged")
        .withArgs(skillId, false, (v) => v > 0);
    });

    it("should emit SkillStatusChanged on deactivate", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await expect(registry.connect(author1).deactivateSkill(skillId))
        .to.emit(registry, "SkillStatusChanged")
        .withArgs(skillId, false, (v) => v > 0);
    });

    it("should emit SkillStatusChanged on reactivate", async function () {
      const { registry, author1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await registry.connect(author1).deactivateSkill(skillId);

      await expect(registry.connect(author1).reactivateSkill(skillId))
        .to.emit(registry, "SkillStatusChanged")
        .withArgs(skillId, true, (v) => v > 0);
    });

    it("should emit TreasuryUpdated on setTreasury", async function () {
      const { registry, owner, treasury, buyer1 } = await loadFixture(deploySkillRegistry);

      await expect(registry.connect(owner).setTreasury(buyer1.address))
        .to.emit(registry, "TreasuryUpdated")
        .withArgs(treasury.address, buyer1.address);
    });

    it("should emit BonzaiTokenUpdated on setBonzaiToken", async function () {
      const { registry, bonzaiToken, owner, buyer1 } = await loadFixture(deploySkillRegistry);

      await expect(registry.connect(owner).setBonzaiToken(buyer1.address))
        .to.emit(registry, "BonzaiTokenUpdated")
        .withArgs(await bonzaiToken.getAddress(), buyer1.address);
    });

    it("should emit SkillOwnershipContractUpdated on setSkillOwnershipContract", async function () {
      const { registry, mockOwnership, owner, buyer1 } = await loadFixture(deploySkillRegistry);

      await expect(registry.connect(owner).setSkillOwnershipContract(buyer1.address))
        .to.emit(registry, "SkillOwnershipContractUpdated")
        .withArgs(await mockOwnership.getAddress(), buyer1.address);
    });

    it("should emit CoOwnerShareFallbackToTreasury when ownership reverts", async function () {
      const { registry, mockOwnership, author1, buyer1 } = await loadFixture(deploySkillRegistry);
      const { skillId } = await registerDefaultSkill(registry, author1);

      await mockOwnership.setRevert(true);

      const expectedCoOwnerShare = (SKILL_PURCHASE_PRICE * 8000n) / 10000n;

      await expect(
        registry.connect(buyer1).purchaseSkill(skillId, { value: SKILL_PURCHASE_PRICE })
      )
        .to.emit(registry, "CoOwnerShareFallbackToTreasury")
        .withArgs(skillId, expectedCoOwnerShare);
    });
  });
});
