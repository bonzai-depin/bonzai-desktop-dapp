const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deploySkillOwnership } = require("./helpers/deploy");
const { MIN_PROFILE_SCORE } = require("./helpers/constants");

const { time } = require("@nomicfoundation/hardhat-network-helpers");

// ═══════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a deadline 1 hour in the future relative to blockchain time.
 * Using Date.now() fails when blockchain time has been advanced by other tests.
 */
async function futureDeadline() {
  const latest = await time.latest();
  return latest + 3600;
}

/**
 * Mint a companion NFT and return the tokenId.
 * MockBonzaiCompanions.mintTo() auto-increments from 1.
 * We use staticCall to read the return value, then send the actual tx.
 */
async function mintCompanionNFT(companionNFT, toAddress) {
  const tokenId = await companionNFT.mintTo.staticCall(toAddress);
  await companionNFT.mintTo(toAddress);
  return tokenId;
}

/**
 * Create a valid attestation for companion registration.
 * The attestation signs: (skillId, companionTokenId, companionWallet, ownerAddress, profileScore, deadline, chainId)
 */
async function createAttestation(
  attestationSigner,
  skillId,
  companionTokenId,
  companionWallet,
  ownerAddress,
  profileScore,
  deadline,
  contractAddress
) {
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const messageHash = ethers.solidityPackedKeccak256(
    ["bytes32", "uint256", "address", "address", "uint8", "uint256", "uint256", "address"],
    [skillId, companionTokenId, companionWallet, ownerAddress, profileScore, deadline, chainId, contractAddress]
  );

  const attestation = await attestationSigner.signMessage(ethers.getBytes(messageHash));
  return attestation;
}

/**
 * Convenience: register a companion with all defaults, returning the params used.
 */
async function registerCompanionHelper(
  ownership,
  companionNFT,
  bonzaiToken,
  attestationSigner,
  registrar,
  overrides = {}
) {
  const skillId = overrides.skillId ?? ethers.keccak256(ethers.toUtf8Bytes("test-skill"));
  const tokenId = overrides.tokenId ?? (await mintCompanionNFT(companionNFT, registrar.address));
  const companionWallet = overrides.companionWallet ?? ethers.Wallet.createRandom().address;
  const profileScore = overrides.profileScore ?? 7;
  const deadline = overrides.deadline ?? await futureDeadline();

  // Give the companion wallet some BONZAI tokens for weighted distribution
  if (overrides.bonzaiAmount !== undefined && overrides.bonzaiAmount > 0n) {
    await bonzaiToken.mint(companionWallet, overrides.bonzaiAmount);
  }

  const attestation = await createAttestation(
    attestationSigner,
    skillId,
    tokenId,
    companionWallet,
    registrar.address,
    profileScore,
    deadline,
    await ownership.getAddress()
  );

  await ownership.connect(registrar).registerCompanion(
    skillId,
    tokenId,
    companionWallet,
    profileScore,
    deadline,
    attestation
  );

  return { skillId, tokenId, companionWallet, profileScore, deadline, attestation };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("BonzaiSkillOwnership", function () {
  // ─────────────────────────────────────────────────────────────────────────
  // DEPLOYMENT
  // ─────────────────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("should set the correct skillRegistry address", async function () {
      const { ownership, skillRegistryWallet } = await loadFixture(deploySkillOwnership);
      expect(await ownership.skillRegistry()).to.equal(skillRegistryWallet.address);
    });

    it("should set the correct bonzaiToken address", async function () {
      const { ownership, bonzaiToken } = await loadFixture(deploySkillOwnership);
      expect(await ownership.bonzaiToken()).to.equal(await bonzaiToken.getAddress());
    });

    it("should set the correct treasury address", async function () {
      const { ownership, treasury } = await loadFixture(deploySkillOwnership);
      expect(await ownership.treasury()).to.equal(treasury.address);
    });

    it("should set the correct attestationSigner address", async function () {
      const { ownership, attestationSigner } = await loadFixture(deploySkillOwnership);
      expect(await ownership.attestationSigner()).to.equal(attestationSigner.address);
    });

    it("should set the correct companionNFT address", async function () {
      const { ownership, companionNFT } = await loadFixture(deploySkillOwnership);
      expect(await ownership.companionNFT()).to.equal(await companionNFT.getAddress());
    });

    it("should set MIN_PROFILE_SCORE to 5", async function () {
      const { ownership } = await loadFixture(deploySkillOwnership);
      expect(await ownership.MIN_PROFILE_SCORE()).to.equal(MIN_PROFILE_SCORE);
    });

    it("should set MAX_COMPANIONS_PER_SKILL to 100", async function () {
      const { ownership } = await loadFixture(deploySkillOwnership);
      expect(await ownership.MAX_COMPANIONS_PER_SKILL()).to.equal(100);
    });

    it("should set NUM_CATEGORIES to 12", async function () {
      const { ownership } = await loadFixture(deploySkillOwnership);
      expect(await ownership.NUM_CATEGORIES()).to.equal(12);
    });

    it("should initialize category index mappings correctly", async function () {
      const { ownership } = await loadFixture(deploySkillOwnership);
      const categories = [
        "education", "entertainment", "fashion", "finance", "food", "healthcare",
        "housing", "beauty", "reading", "social", "travel", "sports",
      ];
      for (let i = 0; i < categories.length; i++) {
        expect(await ownership.categoryToIndex(categories[i])).to.equal(i);
      }
    });

    it("should start with zero totalRevenueDistributed", async function () {
      const { ownership } = await loadFixture(deploySkillOwnership);
      expect(await ownership.totalRevenueDistributed()).to.equal(0);
    });

    it("should start with zero totalRevenueClaimed", async function () {
      const { ownership } = await loadFixture(deploySkillOwnership);
      expect(await ownership.totalRevenueClaimed()).to.equal(0);
    });

    it("should revert deployment with zero skillRegistry address", async function () {
      const [, treasury, attestationSigner] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const bonzaiToken = await MockERC20.deploy("BONZAI", "BONZAI");
      const MockBonzaiCompanions = await ethers.getContractFactory("MockBonzaiCompanions");
      const companionNFT = await MockBonzaiCompanions.deploy();

      const BonzaiSkillOwnership = await ethers.getContractFactory("BonzaiSkillOwnership");
      await expect(
        BonzaiSkillOwnership.deploy(
          ethers.ZeroAddress,
          await bonzaiToken.getAddress(),
          treasury.address,
          attestationSigner.address,
          await companionNFT.getAddress()
        )
      ).to.be.revertedWithCustomError(BonzaiSkillOwnership, "ZeroAddress");
    });

    it("should revert deployment with zero bonzaiToken address", async function () {
      const [, treasury, attestationSigner, , , skillRegistry] = await ethers.getSigners();
      const MockBonzaiCompanions = await ethers.getContractFactory("MockBonzaiCompanions");
      const companionNFT = await MockBonzaiCompanions.deploy();

      const BonzaiSkillOwnership = await ethers.getContractFactory("BonzaiSkillOwnership");
      await expect(
        BonzaiSkillOwnership.deploy(
          skillRegistry.address,
          ethers.ZeroAddress,
          treasury.address,
          attestationSigner.address,
          await companionNFT.getAddress()
        )
      ).to.be.revertedWithCustomError(BonzaiSkillOwnership, "ZeroAddress");
    });

    it("should revert deployment with zero treasury address", async function () {
      const [, , attestationSigner, , , skillRegistry] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const bonzaiToken = await MockERC20.deploy("BONZAI", "BONZAI");
      const MockBonzaiCompanions = await ethers.getContractFactory("MockBonzaiCompanions");
      const companionNFT = await MockBonzaiCompanions.deploy();

      const BonzaiSkillOwnership = await ethers.getContractFactory("BonzaiSkillOwnership");
      await expect(
        BonzaiSkillOwnership.deploy(
          skillRegistry.address,
          await bonzaiToken.getAddress(),
          ethers.ZeroAddress,
          attestationSigner.address,
          await companionNFT.getAddress()
        )
      ).to.be.revertedWithCustomError(BonzaiSkillOwnership, "ZeroAddress");
    });

    it("should revert deployment with zero attestationSigner address", async function () {
      const [, treasury, , , , skillRegistry] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const bonzaiToken = await MockERC20.deploy("BONZAI", "BONZAI");
      const MockBonzaiCompanions = await ethers.getContractFactory("MockBonzaiCompanions");
      const companionNFT = await MockBonzaiCompanions.deploy();

      const BonzaiSkillOwnership = await ethers.getContractFactory("BonzaiSkillOwnership");
      await expect(
        BonzaiSkillOwnership.deploy(
          skillRegistry.address,
          await bonzaiToken.getAddress(),
          treasury.address,
          ethers.ZeroAddress,
          await companionNFT.getAddress()
        )
      ).to.be.revertedWithCustomError(BonzaiSkillOwnership, "ZeroAddress");
    });

    it("should revert deployment with zero companionNFT address", async function () {
      const [, treasury, attestationSigner, , , skillRegistry] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const bonzaiToken = await MockERC20.deploy("BONZAI", "BONZAI");

      const BonzaiSkillOwnership = await ethers.getContractFactory("BonzaiSkillOwnership");
      await expect(
        BonzaiSkillOwnership.deploy(
          skillRegistry.address,
          await bonzaiToken.getAddress(),
          treasury.address,
          attestationSigner.address,
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(BonzaiSkillOwnership, "ZeroAddress");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // COMPANION REGISTRATION
  // ─────────────────────────────────────────────────────────────────────────

  describe("Companion Registration", function () {
    it("should register a companion successfully", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("test-skill"));
      const tokenId = await mintCompanionNFT(companionNFT, registrar1.address);
      const companionWallet = ethers.Wallet.createRandom().address;
      const profileScore = 7;
      const deadline = await futureDeadline();

      const attestation = await createAttestation(
        attestationSigner,
        skillId,
        tokenId,
        companionWallet,
        registrar1.address,
        profileScore,
        deadline,
        await ownership.getAddress()
      );

      await expect(
        ownership.connect(registrar1).registerCompanion(
          skillId, tokenId, companionWallet, profileScore, deadline, attestation
        )
      ).to.not.be.reverted;

      expect(await ownership.isCompanionRegistered(tokenId, skillId)).to.be.true;
      expect(await ownership.getSkillCompanionCount(skillId)).to.equal(1);
    });

    it("should register multiple companions for the same skill", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, registrar2 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("multi-skill"));

      // Register companion 1
      await registerCompanionHelper(ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, { skillId });
      // Register companion 2
      await registerCompanionHelper(ownership, companionNFT, bonzaiToken, attestationSigner, registrar2, { skillId });

      expect(await ownership.getSkillCompanionCount(skillId)).to.equal(2);
    });

    it("should store correct registration details", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("detail-skill"));
      const companionWallet = ethers.Wallet.createRandom().address;
      const profileScore = 8;

      const { tokenId } = await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId, companionWallet, profileScore }
      );

      const reg = await ownership.getCompanionRegistration(tokenId, skillId);
      expect(reg.companionTokenId).to.equal(tokenId);
      expect(reg.companionWallet).to.equal(companionWallet);
      expect(reg.ownerAddress).to.equal(registrar1.address);
      expect(reg.profileScore).to.equal(profileScore);

      expect(reg.registeredAt).to.be.gt(0);
    });

    it("should revert when companion wallet is zero address", async function () {
      const { ownership, companionNFT, attestationSigner, registrar1 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("zero-wallet-skill"));
      const tokenId = await mintCompanionNFT(companionNFT, registrar1.address);
      const profileScore = 7;
      const deadline = await futureDeadline();

      const attestation = await createAttestation(
        attestationSigner, skillId, tokenId, ethers.ZeroAddress, registrar1.address, profileScore, deadline, await ownership.getAddress()
      );

      await expect(
        ownership.connect(registrar1).registerCompanion(
          skillId, tokenId, ethers.ZeroAddress, profileScore, deadline, attestation
        )
      ).to.be.revertedWithCustomError(ownership, "ZeroAddress");
    });

    it("should revert when profile score is below minimum", async function () {
      const { ownership, companionNFT, attestationSigner, registrar1 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("low-score-skill"));
      const tokenId = await mintCompanionNFT(companionNFT, registrar1.address);
      const companionWallet = ethers.Wallet.createRandom().address;
      const lowScore = 4; // Below MIN_PROFILE_SCORE (5)
      const deadline = await futureDeadline();

      const attestation = await createAttestation(
        attestationSigner, skillId, tokenId, companionWallet, registrar1.address, lowScore, deadline, await ownership.getAddress()
      );

      await expect(
        ownership.connect(registrar1).registerCompanion(
          skillId, tokenId, companionWallet, lowScore, deadline, attestation
        )
      ).to.be.revertedWithCustomError(ownership, "InvalidProfileScore")
        .withArgs(lowScore, MIN_PROFILE_SCORE);
    });

    it("should revert when profile score is zero", async function () {
      const { ownership, companionNFT, attestationSigner, registrar1 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("zero-score-skill"));
      const tokenId = await mintCompanionNFT(companionNFT, registrar1.address);
      const companionWallet = ethers.Wallet.createRandom().address;
      const deadline = await futureDeadline();

      const attestation = await createAttestation(
        attestationSigner, skillId, tokenId, companionWallet, registrar1.address, 0, deadline, await ownership.getAddress()
      );

      await expect(
        ownership.connect(registrar1).registerCompanion(
          skillId, tokenId, companionWallet, 0, deadline, attestation
        )
      ).to.be.revertedWithCustomError(ownership, "InvalidProfileScore")
        .withArgs(0, MIN_PROFILE_SCORE);
    });

    it("should revert when attestation is expired", async function () {
      const { ownership, companionNFT, attestationSigner, registrar1 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("expired-skill"));
      const tokenId = await mintCompanionNFT(companionNFT, registrar1.address);
      const companionWallet = ethers.Wallet.createRandom().address;
      const profileScore = 7;
      const expiredDeadline = 1; // Already expired (timestamp 1)

      const attestation = await createAttestation(
        attestationSigner, skillId, tokenId, companionWallet, registrar1.address, profileScore, expiredDeadline, await ownership.getAddress()
      );

      await expect(
        ownership.connect(registrar1).registerCompanion(
          skillId, tokenId, companionWallet, profileScore, expiredDeadline, attestation
        )
      ).to.be.revertedWithCustomError(ownership, "AttestationExpired");
    });

    it("should revert when companion is already registered for the skill", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("dupe-skill"));

      const { tokenId, companionWallet, profileScore } = await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, { skillId }
      );

      // Try to register same companion again
      const deadline = await futureDeadline();
      const attestation = await createAttestation(
        attestationSigner, skillId, tokenId, companionWallet, registrar1.address, profileScore, deadline, await ownership.getAddress()
      );

      await expect(
        ownership.connect(registrar1).registerCompanion(
          skillId, tokenId, companionWallet, profileScore, deadline, attestation
        )
      ).to.be.revertedWithCustomError(ownership, "CompanionAlreadyRegistered")
        .withArgs(tokenId, skillId);
    });

    it("should revert with invalid attestation (wrong signer)", async function () {
      const { ownership, companionNFT, registrar1, registrar2 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("bad-attest-skill"));
      const tokenId = await mintCompanionNFT(companionNFT, registrar1.address);
      const companionWallet = ethers.Wallet.createRandom().address;
      const profileScore = 7;
      const deadline = await futureDeadline();

      // Sign with wrong signer (registrar2 instead of attestationSigner)
      const attestation = await createAttestation(
        registrar2, skillId, tokenId, companionWallet, registrar1.address, profileScore, deadline, await ownership.getAddress()
      );

      await expect(
        ownership.connect(registrar1).registerCompanion(
          skillId, tokenId, companionWallet, profileScore, deadline, attestation
        )
      ).to.be.revertedWithCustomError(ownership, "InvalidAttestation");
    });

    it("should revert with invalid attestation (tampered data)", async function () {
      const { ownership, companionNFT, attestationSigner, registrar1 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("tampered-skill"));
      const tokenId = await mintCompanionNFT(companionNFT, registrar1.address);
      const companionWallet = ethers.Wallet.createRandom().address;
      const profileScore = 7;
      const deadline = await futureDeadline();

      // Sign for profileScore=7 but submit profileScore=10
      const attestation = await createAttestation(
        attestationSigner, skillId, tokenId, companionWallet, registrar1.address, profileScore, deadline, await ownership.getAddress()
      );

      await expect(
        ownership.connect(registrar1).registerCompanion(
          skillId, tokenId, companionWallet, 10, deadline, attestation
        )
      ).to.be.revertedWithCustomError(ownership, "InvalidAttestation");
    });

    it("should accept registration at exactly MIN_PROFILE_SCORE", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("min-score-skill"));

      await expect(
        registerCompanionHelper(
          ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
          { skillId, profileScore: MIN_PROFILE_SCORE }
        )
      ).to.not.be.reverted;
    });

    it("should revert when contract is paused", async function () {
      const { ownership, companionNFT, attestationSigner, registrar1, owner } =
        await loadFixture(deploySkillOwnership);

      await ownership.connect(owner).pause();

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("paused-skill"));
      const tokenId = await mintCompanionNFT(companionNFT, registrar1.address);
      const companionWallet = ethers.Wallet.createRandom().address;
      const profileScore = 7;
      const deadline = await futureDeadline();

      const attestation = await createAttestation(
        attestationSigner, skillId, tokenId, companionWallet, registrar1.address, profileScore, deadline, await ownership.getAddress()
      );

      await expect(
        ownership.connect(registrar1).registerCompanion(
          skillId, tokenId, companionWallet, profileScore, deadline, attestation
        )
      ).to.be.revertedWithCustomError(ownership, "EnforcedPause");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // NFT OWNERSHIP VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────

  describe("NFT Ownership Verification", function () {
    it("should revert when caller does not own the companion NFT", async function () {
      const { ownership, companionNFT, attestationSigner, registrar1, registrar2 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("nft-check-skill"));
      // Mint NFT to registrar2, but registrar1 tries to register
      const tokenId = await mintCompanionNFT(companionNFT, registrar2.address);
      const companionWallet = ethers.Wallet.createRandom().address;
      const profileScore = 7;
      const deadline = await futureDeadline();

      // Create attestation with registrar1 as owner (but NFT belongs to registrar2)
      const attestation = await createAttestation(
        attestationSigner, skillId, tokenId, companionWallet, registrar1.address, profileScore, deadline, await ownership.getAddress()
      );

      await expect(
        ownership.connect(registrar1).registerCompanion(
          skillId, tokenId, companionWallet, profileScore, deadline, attestation
        )
      ).to.be.revertedWithCustomError(ownership, "NotNFTOwner")
        .withArgs(registrar1.address, tokenId);
    });

    it("should allow registration by the actual NFT owner", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("real-owner-skill"));
      const tokenId = await mintCompanionNFT(companionNFT, registrar1.address);
      const companionWallet = ethers.Wallet.createRandom().address;
      const profileScore = 7;
      const deadline = await futureDeadline();

      const attestation = await createAttestation(
        attestationSigner, skillId, tokenId, companionWallet, registrar1.address, profileScore, deadline, await ownership.getAddress()
      );

      await expect(
        ownership.connect(registrar1).registerCompanion(
          skillId, tokenId, companionWallet, profileScore, deadline, attestation
        )
      ).to.not.be.reverted;
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // COMPANION DEREGISTRATION
  // ─────────────────────────────────────────────────────────────────────────

  describe("Companion Deregistration", function () {
    it("should deregister a companion successfully", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("dereg-skill"));
      const { tokenId } = await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, { skillId }
      );

      await expect(
        ownership.connect(registrar1).deregisterCompanion(skillId, tokenId)
      ).to.not.be.reverted;

      expect(await ownership.isCompanionRegistered(tokenId, skillId)).to.be.false;
      expect(await ownership.getSkillCompanionCount(skillId)).to.equal(0);
    });

    it("should correctly swap-and-pop when deregistering from the middle", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, registrar2 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("swap-skill"));

      // Register 3 companions (2 by registrar1, 1 by registrar2)
      const reg1 = await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, { skillId }
      );
      const reg2 = await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar2, { skillId }
      );
      const reg3 = await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, { skillId }
      );

      expect(await ownership.getSkillCompanionCount(skillId)).to.equal(3);

      // Deregister the first companion (triggers swap with last)
      await ownership.connect(registrar1).deregisterCompanion(skillId, reg1.tokenId);

      expect(await ownership.getSkillCompanionCount(skillId)).to.equal(2);
      expect(await ownership.isCompanionRegistered(reg1.tokenId, skillId)).to.be.false;
      expect(await ownership.isCompanionRegistered(reg2.tokenId, skillId)).to.be.true;
      expect(await ownership.isCompanionRegistered(reg3.tokenId, skillId)).to.be.true;
    });

    it("should revert when companion is not registered", async function () {
      const { ownership, registrar1 } = await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("not-registered-skill"));
      const fakeTokenId = 999;

      await expect(
        ownership.connect(registrar1).deregisterCompanion(skillId, fakeTokenId)
      ).to.be.revertedWithCustomError(ownership, "CompanionNotRegistered")
        .withArgs(fakeTokenId, skillId);
    });

    it("should revert when caller is not the registration owner", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, registrar2 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("wrong-owner-skill"));
      const { tokenId } = await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, { skillId }
      );

      // registrar2 tries to deregister registrar1's companion
      await expect(
        ownership.connect(registrar2).deregisterCompanion(skillId, tokenId)
      ).to.be.revertedWith("Not companion owner");
    });

    it("should allow re-registration after deregistration", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("rereg-skill"));
      const tokenId = await mintCompanionNFT(companionNFT, registrar1.address);
      const companionWallet = ethers.Wallet.createRandom().address;
      const profileScore = 7;
      const deadline = await futureDeadline();
      const contractAddr = await ownership.getAddress();

      // Register
      const attestation1 = await createAttestation(
        attestationSigner, skillId, tokenId, companionWallet, registrar1.address, profileScore, deadline, contractAddr
      );
      await ownership.connect(registrar1).registerCompanion(
        skillId, tokenId, companionWallet, profileScore, deadline, attestation1
      );

      // Deregister
      await ownership.connect(registrar1).deregisterCompanion(skillId, tokenId);
      expect(await ownership.isCompanionRegistered(tokenId, skillId)).to.be.false;

      // Re-register with a different deadline to produce a unique attestation
      const deadline2 = deadline + 1;
      const attestation2 = await createAttestation(
        attestationSigner, skillId, tokenId, companionWallet, registrar1.address, profileScore, deadline2, contractAddr
      );
      await ownership.connect(registrar1).registerCompanion(
        skillId, tokenId, companionWallet, profileScore, deadline2, attestation2
      );
      expect(await ownership.isCompanionRegistered(tokenId, skillId)).to.be.true;
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REVENUE DISTRIBUTION
  // ─────────────────────────────────────────────────────────────────────────

  describe("Revenue Distribution", function () {
    it("should revert when called by non-skillRegistry address", async function () {
      const { ownership, registrar1 } = await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("auth-skill"));
      const amount = ethers.parseEther("1");

      await expect(
        ownership.connect(registrar1).distributeRevenue(skillId, amount, { value: amount })
      ).to.be.revertedWithCustomError(ownership, "OnlySkillRegistry");
    });

    it("should send revenue to treasury when no companions registered (fallback)", async function () {
      const { ownership, treasury, skillRegistryWallet } = await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("empty-skill"));
      const amount = ethers.parseEther("1");

      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);

      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount, { value: amount });

      const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(amount);
    });

    it("should distribute revenue weighted by BONZAI balance * profileScore", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, registrar2, skillRegistryWallet } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("weighted-skill"));

      // Companion 1: 100 BONZAI, profileScore 10 => weight = 100 * 10 = 1000
      const wallet1 = ethers.Wallet.createRandom().address;
      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId, companionWallet: wallet1, profileScore: 10, bonzaiAmount: ethers.parseEther("100") }
      );

      // Companion 2: 200 BONZAI, profileScore 5 => weight = 200 * 5 = 1000
      const wallet2 = ethers.Wallet.createRandom().address;
      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar2,
        { skillId, companionWallet: wallet2, profileScore: 5, bonzaiAmount: ethers.parseEther("200") }
      );

      const distributeAmount = ethers.parseEther("2");
      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, distributeAmount, {
        value: distributeAmount,
      });

      // Equal weights => 50/50 split
      const revenue1 = await ownership.unclaimedRevenue(wallet1);
      const revenue2 = await ownership.unclaimedRevenue(wallet2);
      expect(revenue1).to.equal(ethers.parseEther("1"));
      expect(revenue2).to.equal(ethers.parseEther("1"));
    });

    it("should distribute revenue proportionally with unequal weights", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, registrar2, skillRegistryWallet } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("unequal-skill"));

      // Companion 1: 300 BONZAI, profileScore 10 => weight = 300 * 10 = 3000
      const wallet1 = ethers.Wallet.createRandom().address;
      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId, companionWallet: wallet1, profileScore: 10, bonzaiAmount: ethers.parseEther("300") }
      );

      // Companion 2: 100 BONZAI, profileScore 10 => weight = 100 * 10 = 1000
      const wallet2 = ethers.Wallet.createRandom().address;
      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar2,
        { skillId, companionWallet: wallet2, profileScore: 10, bonzaiAmount: ethers.parseEther("100") }
      );

      // Total weight = 4000, companion1 gets 3/4, companion2 gets 1/4
      const distributeAmount = ethers.parseEther("4");
      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, distributeAmount, {
        value: distributeAmount,
      });

      const revenue1 = await ownership.unclaimedRevenue(wallet1);
      const revenue2 = await ownership.unclaimedRevenue(wallet2);
      expect(revenue1).to.equal(ethers.parseEther("3"));
      expect(revenue2).to.equal(ethers.parseEther("1"));
    });

    it("should use normalizedBalance of 1 when companion has zero BONZAI", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, skillRegistryWallet } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("zero-balance-skill"));

      // Companion with zero BONZAI, profileScore 8 => normalizedBalance = 1 => weight = 1 * 8 = 8
      const wallet1 = ethers.Wallet.createRandom().address;
      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId, companionWallet: wallet1, profileScore: 8, bonzaiAmount: 0n }
      );

      const distributeAmount = ethers.parseEther("1");
      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, distributeAmount, {
        value: distributeAmount,
      });

      const revenue1 = await ownership.unclaimedRevenue(wallet1);
      expect(revenue1).to.equal(distributeAmount);
    });

    it("should send dust (rounding remainder) to treasury", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, registrar2, skillRegistryWallet, treasury } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("dust-skill"));

      // Companion 1: weight 1 * 5 = 5
      const wallet1 = ethers.Wallet.createRandom().address;
      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId, companionWallet: wallet1, profileScore: 5, bonzaiAmount: 0n }
      );

      // Companion 2: weight 1 * 5 = 5
      const wallet2 = ethers.Wallet.createRandom().address;
      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar2,
        { skillId, companionWallet: wallet2, profileScore: 5, bonzaiAmount: 0n }
      );

      // 3 wei total, each companion gets 1 wei (3*5/10 = 1 each), dust = 1 wei
      const distributeAmount = 3n;

      const treasuryBalBefore = await ethers.provider.getBalance(treasury.address);

      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, distributeAmount, {
        value: distributeAmount,
      });

      const treasuryBalAfter = await ethers.provider.getBalance(treasury.address);
      const revenue1 = await ownership.unclaimedRevenue(wallet1);
      const revenue2 = await ownership.unclaimedRevenue(wallet2);

      // Each gets floor(3 * 5 / 10) = 1 wei
      expect(revenue1).to.equal(1n);
      expect(revenue2).to.equal(1n);
      // Dust = 3 - 2 = 1 wei sent to treasury
      expect(treasuryBalAfter - treasuryBalBefore).to.equal(1n);
    });

    it("should update totalRevenueDistributed", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, skillRegistryWallet } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("total-rev-skill"));

      const wallet1 = ethers.Wallet.createRandom().address;
      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId, companionWallet: wallet1, profileScore: 7, bonzaiAmount: ethers.parseEther("100") }
      );

      const amount = ethers.parseEther("5");
      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount, { value: amount });

      expect(await ownership.totalRevenueDistributed()).to.equal(amount);
    });

    it("should accumulate revenue across multiple distributions", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, skillRegistryWallet } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("accumulate-skill"));

      const wallet1 = ethers.Wallet.createRandom().address;
      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId, companionWallet: wallet1, profileScore: 7, bonzaiAmount: ethers.parseEther("100") }
      );

      const amount1 = ethers.parseEther("1");
      const amount2 = ethers.parseEther("2");
      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount1, { value: amount1 });
      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount2, { value: amount2 });

      expect(await ownership.unclaimedRevenue(wallet1)).to.equal(amount1 + amount2);
    });

    it("should revert when contract is paused", async function () {
      const { ownership, owner, skillRegistryWallet } = await loadFixture(deploySkillOwnership);

      await ownership.connect(owner).pause();

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("paused-dist-skill"));
      const amount = ethers.parseEther("1");

      await expect(
        ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount, { value: amount })
      ).to.be.revertedWithCustomError(ownership, "EnforcedPause");
    });

    it("should accumulate unclaimed revenue across multiple distributions to same wallet", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, skillRegistryWallet } =
        await loadFixture(deploySkillOwnership);

      const skillId1 = ethers.keccak256(ethers.toUtf8Bytes("skill-A"));
      const skillId2 = ethers.keccak256(ethers.toUtf8Bytes("skill-B"));
      const wallet1 = ethers.Wallet.createRandom().address;

      // Register same companion wallet for two different skills (with different NFT token IDs)
      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId: skillId1, companionWallet: wallet1, profileScore: 7, bonzaiAmount: ethers.parseEther("100") }
      );
      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId: skillId2, companionWallet: wallet1, profileScore: 7, bonzaiAmount: 0n }
      );

      const amount1 = ethers.parseEther("1");
      const amount2 = ethers.parseEther("3");
      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId1, amount1, { value: amount1 });
      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId2, amount2, { value: amount2 });

      // Per-skill tracking is no longer kept in storage (ETH-only refactor —
      // unclaimedRevenue is wallet-scoped only).
      expect(await ownership.unclaimedRevenue(wallet1)).to.equal(amount1 + amount2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REVENUE CLAIMING
  // ─────────────────────────────────────────────────────────────────────────

  describe("Revenue Claiming", function () {
    it("should allow claiming accumulated revenue", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, skillRegistryWallet } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("claim-skill"));
      const companionWallet = registrar1.address; // Use registrar1 as companion wallet so they can claim

      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId, companionWallet, profileScore: 7, bonzaiAmount: ethers.parseEther("100") }
      );

      const amount = ethers.parseEther("2");
      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount, { value: amount });

      const balanceBefore = await ethers.provider.getBalance(registrar1.address);

      const tx = await ownership.connect(registrar1).claimRevenue();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(registrar1.address);
      expect(balanceAfter - balanceBefore + gasUsed).to.equal(amount);
    });

    it("should zero out unclaimed revenue after claiming", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, skillRegistryWallet } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("zero-claim-skill"));
      const companionWallet = registrar1.address;

      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId, companionWallet, profileScore: 7, bonzaiAmount: ethers.parseEther("100") }
      );

      const amount = ethers.parseEther("1");
      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount, { value: amount });

      await ownership.connect(registrar1).claimRevenue();

      expect(await ownership.unclaimedRevenue(registrar1.address)).to.equal(0);
    });

    it("should update totalRevenueClaimed after claiming", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, skillRegistryWallet } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("total-claimed-skill"));
      const companionWallet = registrar1.address;

      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId, companionWallet, profileScore: 7, bonzaiAmount: ethers.parseEther("100") }
      );

      const amount = ethers.parseEther("3");
      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount, { value: amount });

      await ownership.connect(registrar1).claimRevenue();

      expect(await ownership.totalRevenueClaimed()).to.equal(amount);
    });

    it("should revert when there is no revenue to claim", async function () {
      const { ownership, registrar1 } = await loadFixture(deploySkillOwnership);

      await expect(
        ownership.connect(registrar1).claimRevenue()
      ).to.be.revertedWithCustomError(ownership, "NoRevenueToClaim");
    });

    it("should revert on second claim without new revenue", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, skillRegistryWallet } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("double-claim-skill"));
      const companionWallet = registrar1.address;

      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId, companionWallet, profileScore: 7, bonzaiAmount: ethers.parseEther("100") }
      );

      const amount = ethers.parseEther("1");
      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount, { value: amount });

      await ownership.connect(registrar1).claimRevenue();

      await expect(
        ownership.connect(registrar1).claimRevenue()
      ).to.be.revertedWithCustomError(ownership, "NoRevenueToClaim");
    });

    it("should allow claiming after new revenue is distributed", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, skillRegistryWallet } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("new-rev-claim-skill"));
      const companionWallet = registrar1.address;

      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId, companionWallet, profileScore: 7, bonzaiAmount: ethers.parseEther("100") }
      );

      const amount1 = ethers.parseEther("1");
      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount1, { value: amount1 });
      await ownership.connect(registrar1).claimRevenue();

      const amount2 = ethers.parseEther("2");
      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount2, { value: amount2 });

      await expect(
        ownership.connect(registrar1).claimRevenue()
      ).to.not.be.reverted;
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ADMIN FUNCTIONS
  // ─────────────────────────────────────────────────────────────────────────

  describe("Admin", function () {
    describe("setAttestationSigner", function () {
      it("should update the attestation signer", async function () {
        const { ownership, owner, registrar1 } = await loadFixture(deploySkillOwnership);

        await ownership.connect(owner).setAttestationSigner(registrar1.address);
        expect(await ownership.attestationSigner()).to.equal(registrar1.address);
      });

      it("should revert when called by non-owner", async function () {
        const { ownership, registrar1 } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(registrar1).setAttestationSigner(registrar1.address)
        ).to.be.revertedWithCustomError(ownership, "OwnableUnauthorizedAccount");
      });

      it("should revert with zero address", async function () {
        const { ownership, owner } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(owner).setAttestationSigner(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(ownership, "ZeroAddress");
      });

      it("should emit AttestationSignerUpdated event", async function () {
        const { ownership, owner, attestationSigner, registrar1 } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(owner).setAttestationSigner(registrar1.address)
        ).to.emit(ownership, "AttestationSignerUpdated")
          .withArgs(attestationSigner.address, registrar1.address);
      });
    });

    describe("setSkillRegistry", function () {
      it("should update the skill registry", async function () {
        const { ownership, owner, registrar1 } = await loadFixture(deploySkillOwnership);

        await ownership.connect(owner).setSkillRegistry(registrar1.address);
        expect(await ownership.skillRegistry()).to.equal(registrar1.address);
      });

      it("should revert when called by non-owner", async function () {
        const { ownership, registrar1 } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(registrar1).setSkillRegistry(registrar1.address)
        ).to.be.revertedWithCustomError(ownership, "OwnableUnauthorizedAccount");
      });

      it("should revert with zero address", async function () {
        const { ownership, owner } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(owner).setSkillRegistry(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(ownership, "ZeroAddress");
      });

      it("should emit SkillRegistryUpdated event", async function () {
        const { ownership, owner, skillRegistryWallet, registrar1 } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(owner).setSkillRegistry(registrar1.address)
        ).to.emit(ownership, "SkillRegistryUpdated")
          .withArgs(skillRegistryWallet.address, registrar1.address);
      });
    });

    describe("setTreasury", function () {
      it("should update the treasury", async function () {
        const { ownership, owner, registrar1 } = await loadFixture(deploySkillOwnership);

        await ownership.connect(owner).setTreasury(registrar1.address);
        expect(await ownership.treasury()).to.equal(registrar1.address);
      });

      it("should revert when called by non-owner", async function () {
        const { ownership, registrar1 } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(registrar1).setTreasury(registrar1.address)
        ).to.be.revertedWithCustomError(ownership, "OwnableUnauthorizedAccount");
      });

      it("should revert with zero address", async function () {
        const { ownership, owner } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(owner).setTreasury(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(ownership, "ZeroAddress");
      });

      it("should emit TreasuryUpdated event", async function () {
        const { ownership, owner, treasury, registrar1 } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(owner).setTreasury(registrar1.address)
        ).to.emit(ownership, "TreasuryUpdated")
          .withArgs(treasury.address, registrar1.address);
      });
    });

    describe("setBonzaiToken", function () {
      it("should update the bonzai token", async function () {
        const { ownership, owner, registrar1 } = await loadFixture(deploySkillOwnership);

        await ownership.connect(owner).setBonzaiToken(registrar1.address);
        expect(await ownership.bonzaiToken()).to.equal(registrar1.address);
      });

      it("should revert when called by non-owner", async function () {
        const { ownership, registrar1 } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(registrar1).setBonzaiToken(registrar1.address)
        ).to.be.revertedWithCustomError(ownership, "OwnableUnauthorizedAccount");
      });

      it("should revert with zero address", async function () {
        const { ownership, owner } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(owner).setBonzaiToken(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(ownership, "ZeroAddress");
      });

      it("should emit BonzaiTokenUpdated event", async function () {
        const { ownership, owner, bonzaiToken, registrar1 } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(owner).setBonzaiToken(registrar1.address)
        ).to.emit(ownership, "BonzaiTokenUpdated")
          .withArgs(await bonzaiToken.getAddress(), registrar1.address);
      });
    });

    describe("setCompanionNFT", function () {
      it("should update the companion NFT", async function () {
        const { ownership, owner, registrar1 } = await loadFixture(deploySkillOwnership);

        await ownership.connect(owner).setCompanionNFT(registrar1.address);
        expect(await ownership.companionNFT()).to.equal(registrar1.address);
      });

      it("should revert when called by non-owner", async function () {
        const { ownership, registrar1 } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(registrar1).setCompanionNFT(registrar1.address)
        ).to.be.revertedWithCustomError(ownership, "OwnableUnauthorizedAccount");
      });

      it("should revert with zero address", async function () {
        const { ownership, owner } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(owner).setCompanionNFT(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(ownership, "ZeroAddress");
      });

      it("should emit CompanionNFTUpdated event", async function () {
        const { ownership, owner, companionNFT, registrar1 } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(owner).setCompanionNFT(registrar1.address)
        ).to.emit(ownership, "CompanionNFTUpdated")
          .withArgs(await companionNFT.getAddress(), registrar1.address);
      });
    });

    describe("pause / unpause", function () {
      it("should pause the contract", async function () {
        const { ownership, owner } = await loadFixture(deploySkillOwnership);

        await ownership.connect(owner).pause();
        expect(await ownership.paused()).to.be.true;
      });

      it("should unpause the contract", async function () {
        const { ownership, owner } = await loadFixture(deploySkillOwnership);

        await ownership.connect(owner).pause();
        await ownership.connect(owner).unpause();
        expect(await ownership.paused()).to.be.false;
      });

      it("should revert pause when called by non-owner", async function () {
        const { ownership, registrar1 } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(registrar1).pause()
        ).to.be.revertedWithCustomError(ownership, "OwnableUnauthorizedAccount");
      });

      it("should revert unpause when called by non-owner", async function () {
        const { ownership, owner, registrar1 } = await loadFixture(deploySkillOwnership);

        await ownership.connect(owner).pause();
        await expect(
          ownership.connect(registrar1).unpause()
        ).to.be.revertedWithCustomError(ownership, "OwnableUnauthorizedAccount");
      });
    });

    describe("withdrawSurplus", function () {
      it("should withdraw surplus ETH sent directly to contract", async function () {
        const { ownership, owner } = await loadFixture(deploySkillOwnership);

        // Send surplus ETH directly to contract
        const surplusAmount = ethers.parseEther("1");
        await owner.sendTransaction({
          to: await ownership.getAddress(),
          value: surplusAmount,
        });

        const ownerBalBefore = await ethers.provider.getBalance(owner.address);

        const tx = await ownership.connect(owner).withdrawSurplus();
        const receipt = await tx.wait();
        const gasUsed = receipt.gasUsed * receipt.gasPrice;

        const ownerBalAfter = await ethers.provider.getBalance(owner.address);
        expect(ownerBalAfter - ownerBalBefore + gasUsed).to.equal(surplusAmount);
      });

      it("should revert when there is no surplus", async function () {
        const { ownership, owner } = await loadFixture(deploySkillOwnership);

        await expect(
          ownership.connect(owner).withdrawSurplus()
        ).to.be.revertedWithCustomError(ownership, "NoSurplus");
      });

      it("should not withdraw unclaimed revenue (only surplus)", async function () {
        const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, skillRegistryWallet, owner } =
          await loadFixture(deploySkillOwnership);

        const skillId = ethers.keccak256(ethers.toUtf8Bytes("surplus-test-skill"));
        const wallet1 = ethers.Wallet.createRandom().address;

        await registerCompanionHelper(
          ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
          { skillId, companionWallet: wallet1, profileScore: 7, bonzaiAmount: ethers.parseEther("100") }
        );

        const amount = ethers.parseEther("5");
        await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount, { value: amount });

        // No surplus since all ETH is accountable (owed to wallet1)
        await expect(
          ownership.connect(owner).withdrawSurplus()
        ).to.be.revertedWithCustomError(ownership, "NoSurplus");
      });

      it("should only withdraw the surplus portion, not accountable funds", async function () {
        const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, skillRegistryWallet, owner } =
          await loadFixture(deploySkillOwnership);

        const skillId = ethers.keccak256(ethers.toUtf8Bytes("partial-surplus-skill"));
        const wallet1 = ethers.Wallet.createRandom().address;

        await registerCompanionHelper(
          ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
          { skillId, companionWallet: wallet1, profileScore: 7, bonzaiAmount: ethers.parseEther("100") }
        );

        // Distribute 1 ETH (accountable)
        const revAmount = ethers.parseEther("1");
        await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, revAmount, { value: revAmount });

        // Send 2 ETH surplus directly
        const surplusAmount = ethers.parseEther("2");
        await owner.sendTransaction({
          to: await ownership.getAddress(),
          value: surplusAmount,
        });

        const ownerBalBefore = await ethers.provider.getBalance(owner.address);

        const tx = await ownership.connect(owner).withdrawSurplus();
        const receipt = await tx.wait();
        const gasUsed = receipt.gasUsed * receipt.gasPrice;

        const ownerBalAfter = await ethers.provider.getBalance(owner.address);
        // Should only withdraw the surplus (2 ETH), not the accountable (1 ETH)
        expect(ownerBalAfter - ownerBalBefore + gasUsed).to.equal(surplusAmount);
      });

      it("should revert when called by non-owner", async function () {
        const { ownership, owner, registrar1 } = await loadFixture(deploySkillOwnership);

        // Send surplus
        await owner.sendTransaction({
          to: await ownership.getAddress(),
          value: ethers.parseEther("1"),
        });

        await expect(
          ownership.connect(registrar1).withdrawSurplus()
        ).to.be.revertedWithCustomError(ownership, "OwnableUnauthorizedAccount");
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW FUNCTIONS
  // ─────────────────────────────────────────────────────────────────────────

  describe("View Functions", function () {
    describe("getSkillCompanions", function () {
      it("should return empty array for unregistered skill", async function () {
        const { ownership } = await loadFixture(deploySkillOwnership);
        const skillId = ethers.keccak256(ethers.toUtf8Bytes("empty-skill-view"));
        const companions = await ownership.getSkillCompanions(skillId);
        expect(companions.length).to.equal(0);
      });

      it("should return all registered companions", async function () {
        const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, registrar2 } =
          await loadFixture(deploySkillOwnership);

        const skillId = ethers.keccak256(ethers.toUtf8Bytes("view-all-skill"));
        await registerCompanionHelper(ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, { skillId });
        await registerCompanionHelper(ownership, companionNFT, bonzaiToken, attestationSigner, registrar2, { skillId });

        const companions = await ownership.getSkillCompanions(skillId);
        expect(companions.length).to.equal(2);
      });
    });

    describe("getSkillCompanionCount", function () {
      it("should return 0 for unregistered skill", async function () {
        const { ownership } = await loadFixture(deploySkillOwnership);
        const skillId = ethers.keccak256(ethers.toUtf8Bytes("count-empty-skill"));
        expect(await ownership.getSkillCompanionCount(skillId)).to.equal(0);
      });

      it("should return correct count after registration and deregistration", async function () {
        const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1 } =
          await loadFixture(deploySkillOwnership);

        const skillId = ethers.keccak256(ethers.toUtf8Bytes("count-skill"));
        const { tokenId } = await registerCompanionHelper(
          ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, { skillId }
        );
        expect(await ownership.getSkillCompanionCount(skillId)).to.equal(1);

        await ownership.connect(registrar1).deregisterCompanion(skillId, tokenId);
        expect(await ownership.getSkillCompanionCount(skillId)).to.equal(0);
      });
    });

    describe("isCompanionRegistered", function () {
      it("should return false for unregistered companion", async function () {
        const { ownership } = await loadFixture(deploySkillOwnership);
        const skillId = ethers.keccak256(ethers.toUtf8Bytes("is-registered-skill"));
        expect(await ownership.isCompanionRegistered(999, skillId)).to.be.false;
      });

      it("should return true for registered companion", async function () {
        const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1 } =
          await loadFixture(deploySkillOwnership);

        const skillId = ethers.keccak256(ethers.toUtf8Bytes("is-registered-true-skill"));
        const { tokenId } = await registerCompanionHelper(
          ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, { skillId }
        );
        expect(await ownership.isCompanionRegistered(tokenId, skillId)).to.be.true;
      });

      it("should return false after deregistration", async function () {
        const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1 } =
          await loadFixture(deploySkillOwnership);

        const skillId = ethers.keccak256(ethers.toUtf8Bytes("is-dereg-skill"));
        const { tokenId } = await registerCompanionHelper(
          ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, { skillId }
        );
        await ownership.connect(registrar1).deregisterCompanion(skillId, tokenId);
        expect(await ownership.isCompanionRegistered(tokenId, skillId)).to.be.false;
      });
    });

    describe("getCompanionRegistration", function () {
      it("should revert for unregistered companion with CompanionNotRegistered error", async function () {
        const { ownership } = await loadFixture(deploySkillOwnership);
        const skillId = ethers.keccak256(ethers.toUtf8Bytes("get-reg-revert-skill"));
        const fakeTokenId = 42;

        await expect(
          ownership.getCompanionRegistration(fakeTokenId, skillId)
        ).to.be.revertedWithCustomError(ownership, "CompanionNotRegistered")
          .withArgs(fakeTokenId, skillId);
      });

      it("should return correct registration data", async function () {
        const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1 } =
          await loadFixture(deploySkillOwnership);

        const skillId = ethers.keccak256(ethers.toUtf8Bytes("get-reg-data-skill"));
        const companionWallet = ethers.Wallet.createRandom().address;
        const profileScore = 9;

        const { tokenId } = await registerCompanionHelper(
          ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
          { skillId, companionWallet, profileScore }
        );

        const reg = await ownership.getCompanionRegistration(tokenId, skillId);
        expect(reg.companionTokenId).to.equal(tokenId);
        expect(reg.companionWallet).to.equal(companionWallet);
        expect(reg.ownerAddress).to.equal(registrar1.address);
        expect(reg.profileScore).to.equal(profileScore);
  
      });
    });

    // getUnclaimedRevenuePerSkill was removed in the ETH-only refactor —
    // only wallet-scoped unclaimedRevenue is now tracked.

    describe("getStats", function () {
      it("should return zeros initially", async function () {
        const { ownership } = await loadFixture(deploySkillOwnership);
        const [totalDistributed, totalClaimed, contractBalance] = await ownership.getStats();
        expect(totalDistributed).to.equal(0);
        expect(totalClaimed).to.equal(0);
        expect(contractBalance).to.equal(0);
      });

      it("should return correct stats after distribution and claiming", async function () {
        const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, skillRegistryWallet } =
          await loadFixture(deploySkillOwnership);

        const skillId = ethers.keccak256(ethers.toUtf8Bytes("stats-skill"));
        const companionWallet = registrar1.address;

        await registerCompanionHelper(
          ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
          { skillId, companionWallet, profileScore: 7, bonzaiAmount: ethers.parseEther("100") }
        );

        const amount = ethers.parseEther("10");
        await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount, { value: amount });

        let [totalDistributed, totalClaimed, contractBalance] = await ownership.getStats();
        expect(totalDistributed).to.equal(amount);
        expect(totalClaimed).to.equal(0);
        expect(contractBalance).to.equal(amount);

        // Claim
        await ownership.connect(registrar1).claimRevenue();

        [totalDistributed, totalClaimed, contractBalance] = await ownership.getStats();
        expect(totalDistributed).to.equal(amount);
        expect(totalClaimed).to.equal(amount);
        expect(contractBalance).to.equal(0);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EVENTS
  // ─────────────────────────────────────────────────────────────────────────

  describe("Events", function () {
    it("should emit CompanionRegistered on registration", async function () {
      const { ownership, companionNFT, attestationSigner, registrar1 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("event-reg-skill"));
      const tokenId = await mintCompanionNFT(companionNFT, registrar1.address);
      const companionWallet = ethers.Wallet.createRandom().address;
      const profileScore = 7;
      const deadline = await futureDeadline();

      const attestation = await createAttestation(
        attestationSigner, skillId, tokenId, companionWallet, registrar1.address, profileScore, deadline, await ownership.getAddress()
      );

      await expect(
        ownership.connect(registrar1).registerCompanion(
          skillId, tokenId, companionWallet, profileScore, deadline, attestation
        )
      ).to.emit(ownership, "CompanionRegistered")
        .withArgs(skillId, tokenId, companionWallet, registrar1.address, profileScore, () => true);
    });

    it("should emit CompanionDeregistered on deregistration", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1 } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("event-dereg-skill"));
      const { tokenId } = await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, { skillId }
      );

      await expect(
        ownership.connect(registrar1).deregisterCompanion(skillId, tokenId)
      ).to.emit(ownership, "CompanionDeregistered")
        .withArgs(skillId, tokenId, registrar1.address, () => true);
    });

    it("should emit RevenueDistributed on distribution with companions", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, skillRegistryWallet } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("event-dist-skill"));
      const wallet1 = ethers.Wallet.createRandom().address;

      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId, companionWallet: wallet1, profileScore: 7, bonzaiAmount: ethers.parseEther("100") }
      );

      const amount = ethers.parseEther("1");

      await expect(
        ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount, { value: amount })
      ).to.emit(ownership, "RevenueDistributed")
        .withArgs(skillId, amount, 1, () => true);
    });

    it("should emit RevenueFallbackToTreasury when no companions registered", async function () {
      const { ownership, skillRegistryWallet } = await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("event-fallback-skill"));
      const amount = ethers.parseEther("1");

      await expect(
        ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount, { value: amount })
      ).to.emit(ownership, "RevenueFallbackToTreasury")
        .withArgs(skillId, amount, () => true);
    });

    it("should emit RevenueClaimed on claim", async function () {
      const { ownership, companionNFT, bonzaiToken, attestationSigner, registrar1, skillRegistryWallet } =
        await loadFixture(deploySkillOwnership);

      const skillId = ethers.keccak256(ethers.toUtf8Bytes("event-claim-skill"));
      const companionWallet = registrar1.address;

      await registerCompanionHelper(
        ownership, companionNFT, bonzaiToken, attestationSigner, registrar1,
        { skillId, companionWallet, profileScore: 7, bonzaiAmount: ethers.parseEther("100") }
      );

      const amount = ethers.parseEther("3");
      await ownership.connect(skillRegistryWallet).distributeRevenue(skillId, amount, { value: amount });

      await expect(
        ownership.connect(registrar1).claimRevenue()
      ).to.emit(ownership, "RevenueClaimed")
        .withArgs(registrar1.address, amount, () => true);
    });

    it("should emit AttestationSignerUpdated on signer change", async function () {
      const { ownership, owner, attestationSigner, registrar1 } = await loadFixture(deploySkillOwnership);

      await expect(
        ownership.connect(owner).setAttestationSigner(registrar1.address)
      ).to.emit(ownership, "AttestationSignerUpdated")
        .withArgs(attestationSigner.address, registrar1.address);
    });

    it("should emit SkillRegistryUpdated on registry change", async function () {
      const { ownership, owner, skillRegistryWallet, registrar1 } = await loadFixture(deploySkillOwnership);

      await expect(
        ownership.connect(owner).setSkillRegistry(registrar1.address)
      ).to.emit(ownership, "SkillRegistryUpdated")
        .withArgs(skillRegistryWallet.address, registrar1.address);
    });

    it("should emit TreasuryUpdated on treasury change", async function () {
      const { ownership, owner, treasury, registrar1 } = await loadFixture(deploySkillOwnership);

      await expect(
        ownership.connect(owner).setTreasury(registrar1.address)
      ).to.emit(ownership, "TreasuryUpdated")
        .withArgs(treasury.address, registrar1.address);
    });

    it("should emit BonzaiTokenUpdated on token change", async function () {
      const { ownership, owner, bonzaiToken, registrar1 } = await loadFixture(deploySkillOwnership);

      await expect(
        ownership.connect(owner).setBonzaiToken(registrar1.address)
      ).to.emit(ownership, "BonzaiTokenUpdated")
        .withArgs(await bonzaiToken.getAddress(), registrar1.address);
    });

    it("should emit CompanionNFTUpdated on NFT change", async function () {
      const { ownership, owner, companionNFT, registrar1 } = await loadFixture(deploySkillOwnership);

      await expect(
        ownership.connect(owner).setCompanionNFT(registrar1.address)
      ).to.emit(ownership, "CompanionNFTUpdated")
        .withArgs(await companionNFT.getAddress(), registrar1.address);
    });
  });
});
