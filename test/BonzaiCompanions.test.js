const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployCompanions } = require("./helpers/deploy");
const {
  COMPANION_MINT_PRICE,
  MAX_SUPPLY,
  VALID_SPENDING_PROFILE,
  ALL_ONES_PROFILE,
  ALL_TENS_PROFILE,
  packSpendingProfile,
} = require("./helpers/constants");

// ═══════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const AGENT_URI = "ar://abc123-agent-registration";
const UPDATED_URI = "ar://updated-agent-registration";
const PERSONALITY_HASH = ethers.keccak256(ethers.toUtf8Bytes("personality-v1"));
const GENDER_NEUTRAL = 0;
const GENDER_FEMALE = 1;
const GENDER_MALE = 2;

/**
 * Mint a single companion as `signer` and return its tokenId.
 */
async function mintDefault(companions, signer, overrides = {}) {
  const agentWallet = overrides.agentWallet ?? ethers.ZeroAddress;
  const tx = await companions.connect(signer).mintCompanion(
    overrides.agentURI ?? AGENT_URI,
    overrides.personalityHash ?? PERSONALITY_HASH,
    overrides.spendingProfile ?? VALID_SPENDING_PROFILE,
    overrides.gender ?? GENDER_FEMALE,
    agentWallet,
    { value: overrides.value ?? COMPANION_MINT_PRICE }
  );
  const receipt = await tx.wait();
  // Token IDs start at 1 and increment
  const event = receipt.logs.find(
    (l) => l.fragment && l.fragment.name === "CompanionMinted"
  );
  return event ? event.args.tokenId : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("BonzaiCompanions", function () {
  // ─────────────────────────────────────────────────────────────────────────
  // DEPLOYMENT
  // ─────────────────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("should set the correct name and symbol", async function () {
      const { companions } = await loadFixture(deployCompanions);
      expect(await companions.name()).to.equal("BonzAI Companions");
      expect(await companions.symbol()).to.equal("BZCOMP");
    });

    it("should set the treasury address", async function () {
      const { companions, treasury } = await loadFixture(deployCompanions);
      expect(await companions.treasury()).to.equal(treasury.address);
    });

    it("should set the default mint price to 0.25 ETH", async function () {
      const { companions } = await loadFixture(deployCompanions);
      expect(await companions.mintPrice()).to.equal(COMPANION_MINT_PRICE);
    });

    it("should revert deployment with zero treasury address", async function () {
      const BonzaiCompanions = await ethers.getContractFactory("BonzaiCompanions");
      await expect(
        BonzaiCompanions.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid treasury address");
    });

    it("should start with zero total supply", async function () {
      const { companions } = await loadFixture(deployCompanions);
      expect(await companions.totalSupply()).to.equal(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MINTING
  // ─────────────────────────────────────────────────────────────────────────

  describe("mintCompanion", function () {
    it("should mint a companion and store all data correctly", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);
      const agentWallet = ethers.Wallet.createRandom().address;

      const tokenId = await mintDefault(companions, user1, { agentWallet });
      expect(tokenId).to.equal(1);

      const data = await companions.getCompanion(tokenId);
      expect(data.creator).to.equal(user1.address);
      expect(data.personalityHash).to.equal(PERSONALITY_HASH);
      expect(data.spendingProfile).to.equal(VALID_SPENDING_PROFILE);
      expect(data.gender).to.equal(GENDER_FEMALE);
      expect(data.isVerified).to.equal(false);
      expect(data.createdAt).to.be.gt(0);
    });

    it("should send mintPrice ETH to treasury", async function () {
      const { companions, user1, treasury } = await loadFixture(deployCompanions);

      await expect(
        companions.connect(user1).mintCompanion(
          AGENT_URI,
          PERSONALITY_HASH,
          VALID_SPENDING_PROFILE,
          GENDER_FEMALE,
          ethers.ZeroAddress,
          { value: COMPANION_MINT_PRICE }
        )
      ).to.changeEtherBalance(treasury, COMPANION_MINT_PRICE);
    });

    it("should refund excess ETH to the minter", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);
      const excess = ethers.parseEther("0.1");
      const overpay = COMPANION_MINT_PRICE + excess;

      // The minter pays overpay but receives excess back, net cost = mintPrice
      await expect(
        companions.connect(user1).mintCompanion(
          AGENT_URI,
          PERSONALITY_HASH,
          VALID_SPENDING_PROFILE,
          GENDER_FEMALE,
          ethers.ZeroAddress,
          { value: overpay }
        )
      ).to.changeEtherBalance(user1, -COMPANION_MINT_PRICE);
    });

    it("should revert when ETH sent is less than mintPrice", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);
      const insufficient = ethers.parseEther("0.1");

      await expect(
        companions.connect(user1).mintCompanion(
          AGENT_URI,
          PERSONALITY_HASH,
          VALID_SPENDING_PROFILE,
          GENDER_FEMALE,
          ethers.ZeroAddress,
          { value: insufficient }
        )
      ).to.be.revertedWith("Insufficient ETH");
    });

    it("should revert when agentURI is empty", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      await expect(
        companions.connect(user1).mintCompanion(
          "",
          PERSONALITY_HASH,
          VALID_SPENDING_PROFILE,
          GENDER_FEMALE,
          ethers.ZeroAddress,
          { value: COMPANION_MINT_PRICE }
        )
      ).to.be.revertedWith("Empty agent URI");
    });

    it("should revert when MAX_SUPPLY is reached", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      // Directly set _tokenIdCounter to MAX_SUPPLY via storage manipulation
      // Storage slot for _tokenIdCounter is slot 7 (after ERC721 + ERC721URIStorage + Ownable + ReentrancyGuard + Pausable)
      // Instead, we use a simpler approach: set the counter via hardhat_setStorageAt
      // _tokenIdCounter is the first custom state variable after inherited contracts.
      // ERC721: slots 0-4, ERC721URIStorage: slot 5, Ownable: slot 6,
      // ReentrancyGuard: slot 7, Pausable: slot 8, _tokenIdCounter: slot 9
      const companionAddr = await companions.getAddress();

      // Find the correct slot by testing: totalSupply reads _tokenIdCounter
      // We need to set _tokenIdCounter = MAX_SUPPLY (10000)
      // Try slot 9 first (common layout for OZ 5.x with these parents)
      for (let slot = 0; slot <= 15; slot++) {
        const val = await ethers.provider.getStorage(companionAddr, slot);
        if (val === "0x" + "0".repeat(64)) {
          // Candidate zero slot, try setting it
          await ethers.provider.send("hardhat_setStorageAt", [
            companionAddr,
            ethers.toBeHex(slot, 32),
            ethers.toBeHex(MAX_SUPPLY, 32),
          ]);
          const supply = await companions.totalSupply();
          if (supply === BigInt(MAX_SUPPLY)) {
            break; // Found the right slot
          }
          // Reset if wrong
          await ethers.provider.send("hardhat_setStorageAt", [
            companionAddr,
            ethers.toBeHex(slot, 32),
            "0x" + "0".repeat(64),
          ]);
        }
      }

      expect(await companions.totalSupply()).to.equal(MAX_SUPPLY);

      await expect(
        companions.connect(user1).mintCompanion(
          AGENT_URI,
          PERSONALITY_HASH,
          VALID_SPENDING_PROFILE,
          GENDER_FEMALE,
          ethers.ZeroAddress,
          { value: COMPANION_MINT_PRICE }
        )
      ).to.be.revertedWith("Max supply reached");
    });

    it("should increment totalSupply after each mint", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      await mintDefault(companions, user1);
      expect(await companions.totalSupply()).to.equal(1);

      await mintDefault(companions, user1);
      expect(await companions.totalSupply()).to.equal(2);
    });

    it("should emit CompanionMinted event with correct args", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      await expect(
        companions.connect(user1).mintCompanion(
          AGENT_URI,
          PERSONALITY_HASH,
          VALID_SPENDING_PROFILE,
          GENDER_FEMALE,
          ethers.ZeroAddress,
          { value: COMPANION_MINT_PRICE }
        )
      )
        .to.emit(companions, "CompanionMinted")
        .withArgs(1, user1.address, GENDER_FEMALE, VALID_SPENDING_PROFILE, AGENT_URI);
    });

    it("should emit Registered event on mint", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      await expect(
        companions.connect(user1).mintCompanion(
          AGENT_URI,
          PERSONALITY_HASH,
          VALID_SPENDING_PROFILE,
          GENDER_FEMALE,
          ethers.ZeroAddress,
          { value: COMPANION_MINT_PRICE }
        )
      )
        .to.emit(companions, "Registered")
        .withArgs(1, AGENT_URI, user1.address);
    });

    it("should set agentWallet when non-zero address is provided", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);
      const agentWallet = ethers.Wallet.createRandom().address;

      const tokenId = await mintDefault(companions, user1, { agentWallet });
      expect(await companions.getAgentWallet(tokenId)).to.equal(agentWallet);
    });

    it("should not set agentWallet when zero address is provided", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1, { agentWallet: ethers.ZeroAddress });
      expect(await companions.getAgentWallet(tokenId)).to.equal(ethers.ZeroAddress);
    });

    it("should track creator companions", async function () {
      const { companions, user1, user2 } = await loadFixture(deployCompanions);

      await mintDefault(companions, user1);
      await mintDefault(companions, user1);
      await mintDefault(companions, user2);

      const user1Companions = await companions.getCreatorCompanions(user1.address);
      expect(user1Companions.length).to.equal(2);
      expect(user1Companions[0]).to.equal(1);
      expect(user1Companions[1]).to.equal(2);

      const user2Companions = await companions.getCreatorCompanions(user2.address);
      expect(user2Companions.length).to.equal(1);
      expect(user2Companions[0]).to.equal(3);
    });

    it("should revert when paused", async function () {
      const { companions, owner, user1 } = await loadFixture(deployCompanions);
      await companions.connect(owner).pause();

      await expect(
        mintDefault(companions, user1)
      ).to.be.revertedWithCustomError(companions, "EnforcedPause");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SPENDING PROFILE
  // ─────────────────────────────────────────────────────────────────────────

  describe("Spending Profile", function () {
    it("should pack and unpack 12 categories correctly", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);
      const categories = [5, 7, 3, 8, 6, 4, 5, 2, 9, 6, 7, 3];

      const tokenId = await mintDefault(companions, user1, {
        spendingProfile: VALID_SPENDING_PROFILE,
      });

      const unpacked = await companions.getSpendingProfile(tokenId);
      for (let i = 0; i < 12; i++) {
        expect(unpacked[i]).to.equal(categories[i]);
      }
    });

    it("should pack all-ones profile correctly", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1, {
        spendingProfile: ALL_ONES_PROFILE,
      });

      const unpacked = await companions.getSpendingProfile(tokenId);
      for (let i = 0; i < 12; i++) {
        expect(unpacked[i]).to.equal(1);
      }
    });

    it("should pack all-tens profile correctly", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1, {
        spendingProfile: ALL_TENS_PROFILE,
      });

      const unpacked = await companions.getSpendingProfile(tokenId);
      for (let i = 0; i < 12; i++) {
        expect(unpacked[i]).to.equal(10);
      }
    });

    it("should pack via on-chain packSpendingProfile and match JS packing", async function () {
      const { companions } = await loadFixture(deployCompanions);
      const categories = [5, 7, 3, 8, 6, 4, 5, 2, 9, 6, 7, 3];

      const onChainPacked = await companions.packSpendingProfile(categories);
      expect(onChainPacked).to.equal(VALID_SPENDING_PROFILE);
    });

    it("should revert when a nibble value is zero", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);
      // Put zero in the first category
      const badProfile = packSpendingProfile([0, 7, 3, 8, 6, 4, 5, 2, 9, 6, 7, 3]);

      await expect(
        mintDefault(companions, user1, { spendingProfile: badProfile })
      ).to.be.revertedWith("Spending value must be 1-10");
    });

    it("should revert when a nibble value exceeds 10", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);
      // 15 fits in 4 bits but exceeds 10
      const badProfile = packSpendingProfile([15, 7, 3, 8, 6, 4, 5, 2, 9, 6, 7, 3]);

      await expect(
        mintDefault(companions, user1, { spendingProfile: badProfile })
      ).to.be.revertedWith("Spending value must be 1-10");
    });

    it("should revert when upper bits (48-95) are non-zero", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);
      // Set bit 48 (beyond the 12 nibbles)
      const badProfile = VALID_SPENDING_PROFILE | (1n << 48n);

      await expect(
        mintDefault(companions, user1, { spendingProfile: badProfile })
      ).to.be.revertedWith("Upper bits must be zero");
    });

    it("should revert on-chain packSpendingProfile with value > 10", async function () {
      const { companions } = await loadFixture(deployCompanions);

      await expect(
        companions.packSpendingProfile([11, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
      ).to.be.revertedWith("Category value must be 1-10");
    });

    it("should revert on-chain packSpendingProfile with value 0", async function () {
      const { companions } = await loadFixture(deployCompanions);

      await expect(
        companions.packSpendingProfile([0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
      ).to.be.revertedWith("Category value must be 1-10");
    });

    it("should revert getSpendingProfile for non-existent token", async function () {
      const { companions } = await loadFixture(deployCompanions);

      await expect(
        companions.getSpendingProfile(999)
      ).to.be.revertedWith("Token does not exist");
    });

    it("should allow owner to update spending profile via setSpendingProfile", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1, {
        spendingProfile: VALID_SPENDING_PROFILE,
      });

      await companions.connect(user1).setSpendingProfile(tokenId, ALL_TENS_PROFILE);

      const unpacked = await companions.getSpendingProfile(tokenId);
      for (let i = 0; i < 12; i++) {
        expect(unpacked[i]).to.equal(10);
      }
    });

    it("should revert setSpendingProfile for non-owner", async function () {
      const { companions, user1, user2 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);

      await expect(
        companions.connect(user2).setSpendingProfile(tokenId, ALL_TENS_PROFILE)
      ).to.be.revertedWith("Not owner");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ERC-8004 IDENTITY
  // ─────────────────────────────────────────────────────────────────────────

  describe("ERC-8004 Agent Identity", function () {
    it("should return agentURI set during mint", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      expect(await companions.getAgentURI(tokenId)).to.equal(AGENT_URI);
    });

    it("should allow owner to update agentURI", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      await companions.connect(user1).setAgentURI(tokenId, UPDATED_URI);

      expect(await companions.getAgentURI(tokenId)).to.equal(UPDATED_URI);
    });

    it("should emit URIUpdated on setAgentURI", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);

      await expect(companions.connect(user1).setAgentURI(tokenId, UPDATED_URI))
        .to.emit(companions, "URIUpdated")
        .withArgs(tokenId, UPDATED_URI, user1.address);
    });

    it("should revert setAgentURI for non-owner", async function () {
      const { companions, user1, user2 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);

      await expect(
        companions.connect(user2).setAgentURI(tokenId, UPDATED_URI)
      ).to.be.revertedWith("Not owner");
    });

    it("should revert setAgentURI with empty URI", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);

      await expect(
        companions.connect(user1).setAgentURI(tokenId, "")
      ).to.be.revertedWith("Empty URI");
    });

    it("should revert getAgentURI for non-existent token", async function () {
      const { companions } = await loadFixture(deployCompanions);

      await expect(companions.getAgentURI(999)).to.be.revertedWith("Agent does not exist");
    });

    it("should allow owner to set agentWallet", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);
      const newWallet = ethers.Wallet.createRandom().address;

      const tokenId = await mintDefault(companions, user1);
      await companions.connect(user1).setAgentWallet(tokenId, newWallet);

      expect(await companions.getAgentWallet(tokenId)).to.equal(newWallet);
    });

    it("should emit AgentWalletSet on setAgentWallet", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);
      const newWallet = ethers.Wallet.createRandom().address;

      const tokenId = await mintDefault(companions, user1);

      await expect(companions.connect(user1).setAgentWallet(tokenId, newWallet))
        .to.emit(companions, "AgentWalletSet")
        .withArgs(tokenId, newWallet, user1.address);
    });

    it("should revert setAgentWallet for non-owner", async function () {
      const { companions, user1, user2 } = await loadFixture(deployCompanions);
      const newWallet = ethers.Wallet.createRandom().address;

      const tokenId = await mintDefault(companions, user1);

      await expect(
        companions.connect(user2).setAgentWallet(tokenId, newWallet)
      ).to.be.revertedWith("Not owner");
    });

    it("should revert setAgentWallet with zero address", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);

      await expect(
        companions.connect(user1).setAgentWallet(tokenId, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid wallet address");
    });

    it("should allow owner to unset agentWallet", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);
      const agentWallet = ethers.Wallet.createRandom().address;

      const tokenId = await mintDefault(companions, user1, { agentWallet });

      await companions.connect(user1).unsetAgentWallet(tokenId);
      expect(await companions.getAgentWallet(tokenId)).to.equal(ethers.ZeroAddress);
    });

    it("should emit AgentWalletUnset on unsetAgentWallet", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);
      const agentWallet = ethers.Wallet.createRandom().address;

      const tokenId = await mintDefault(companions, user1, { agentWallet });

      await expect(companions.connect(user1).unsetAgentWallet(tokenId))
        .to.emit(companions, "AgentWalletUnset")
        .withArgs(tokenId, agentWallet);
    });

    it("should revert unsetAgentWallet when no wallet is set", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);

      await expect(
        companions.connect(user1).unsetAgentWallet(tokenId)
      ).to.be.revertedWith("No wallet set");
    });

    it("should revert getAgentWallet for non-existent token", async function () {
      const { companions } = await loadFixture(deployCompanions);

      await expect(companions.getAgentWallet(999)).to.be.revertedWith("Agent does not exist");
    });

    // ── Metadata CRUD ──

    it("should set and get metadata", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      const value = ethers.toUtf8Bytes("conversational-agent");

      await companions.connect(user1).setMetadata(tokenId, "domain", value);

      const stored = await companions.getMetadata(tokenId, "domain");
      expect(ethers.toUtf8String(stored)).to.equal("conversational-agent");
    });

    it("should emit MetadataSet on setMetadata", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      const value = ethers.toUtf8Bytes("finance");

      await expect(companions.connect(user1).setMetadata(tokenId, "skill", value))
        .to.emit(companions, "MetadataSet");
    });

    it("should reject 'agentWallet' as metadata key", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      const value = ethers.toUtf8Bytes("0x1234");

      await expect(
        companions.connect(user1).setMetadata(tokenId, "agentWallet", value)
      ).to.be.revertedWith("Use setAgentWallet for wallet changes");
    });

    it("should revert setMetadata for non-owner", async function () {
      const { companions, user1, user2 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      const value = ethers.toUtf8Bytes("test");

      await expect(
        companions.connect(user2).setMetadata(tokenId, "domain", value)
      ).to.be.revertedWith("Not owner");
    });

    it("should revert getMetadata for non-existent token", async function () {
      const { companions } = await loadFixture(deployCompanions);

      await expect(
        companions.getMetadata(999, "domain")
      ).to.be.revertedWith("Agent does not exist");
    });

    // ── setMetadataBatch ──

    it("should set multiple metadata entries in a batch", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      const keys = ["domain", "service", "trust_model"];
      const values = [
        ethers.toUtf8Bytes("finance"),
        ethers.toUtf8Bytes("portfolio-advisor"),
        ethers.toUtf8Bytes("decentralized"),
      ];

      await companions.connect(user1).setMetadataBatch(tokenId, keys, values);

      expect(ethers.toUtf8String(await companions.getMetadata(tokenId, "domain"))).to.equal("finance");
      expect(ethers.toUtf8String(await companions.getMetadata(tokenId, "service"))).to.equal("portfolio-advisor");
      expect(ethers.toUtf8String(await companions.getMetadata(tokenId, "trust_model"))).to.equal("decentralized");
    });

    it("should revert setMetadataBatch with length mismatch", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);

      await expect(
        companions.connect(user1).setMetadataBatch(
          tokenId,
          ["domain", "service"],
          [ethers.toUtf8Bytes("finance")]
        )
      ).to.be.revertedWith("Length mismatch");
    });

    it("should reject 'agentWallet' key inside setMetadataBatch", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);

      await expect(
        companions.connect(user1).setMetadataBatch(
          tokenId,
          ["domain", "agentWallet"],
          [ethers.toUtf8Bytes("finance"), ethers.toUtf8Bytes("0x1234")]
        )
      ).to.be.revertedWith("Use setAgentWallet for wallet changes");
    });

    it("should revert setMetadataBatch for non-owner", async function () {
      const { companions, user1, user2 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);

      await expect(
        companions.connect(user2).setMetadataBatch(
          tokenId,
          ["domain"],
          [ethers.toUtf8Bytes("finance")]
        )
      ).to.be.revertedWith("Not owner");
    });

    // ── Personality hash ──

    it("should allow owner to update personalityHash", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("personality-v2"));

      await companions.connect(user1).setPersonalityHash(tokenId, newHash);

      const data = await companions.getCompanion(tokenId);
      expect(data.personalityHash).to.equal(newHash);
    });

    it("should revert setPersonalityHash for non-owner", async function () {
      const { companions, user1, user2 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("personality-v2"));

      await expect(
        companions.connect(user2).setPersonalityHash(tokenId, newHash)
      ).to.be.revertedWith("Not owner");
    });

    // ── getAgentIdentity ──

    it("should return full agent identity", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);
      const agentWallet = ethers.Wallet.createRandom().address;

      const tokenId = await mintDefault(companions, user1, { agentWallet });

      const [uri, wallet, tokenOwner] = await companions.getAgentIdentity(tokenId);
      expect(uri).to.equal(AGENT_URI);
      expect(wallet).to.equal(agentWallet);
      expect(tokenOwner).to.equal(user1.address);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ACCESS CONTROL - canUseCompanion
  // ─────────────────────────────────────────────────────────────────────────

  describe("canUseCompanion", function () {
    it("should return true for the token owner", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      expect(await companions.canUseCompanion(user1.address, tokenId)).to.equal(true);
    });

    it("should return true for an approved address", async function () {
      const { companions, user1, user2 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      await companions.connect(user1).approve(user2.address, tokenId);

      expect(await companions.canUseCompanion(user2.address, tokenId)).to.equal(true);
    });

    it("should return true for an approved-for-all operator", async function () {
      const { companions, user1, user2 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      await companions.connect(user1).setApprovalForAll(user2.address, true);

      expect(await companions.canUseCompanion(user2.address, tokenId)).to.equal(true);
    });

    it("should return false for a non-authorized address", async function () {
      const { companions, user1, user2 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      expect(await companions.canUseCompanion(user2.address, tokenId)).to.equal(false);
    });

    it("should return false for a non-existent token", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);
      expect(await companions.canUseCompanion(user1.address, 999)).to.equal(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────

  describe("verifyCompanion", function () {
    it("should allow creator to verify their companion", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      await companions.connect(user1).verifyCompanion(tokenId);

      const data = await companions.getCompanion(tokenId);
      expect(data.isVerified).to.equal(true);
    });

    it("should emit CompanionVerified event", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);

      await expect(companions.connect(user1).verifyCompanion(tokenId))
        .to.emit(companions, "CompanionVerified")
        .withArgs(tokenId, user1.address);
    });

    it("should revert when non-creator tries to verify", async function () {
      const { companions, user1, user2 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);

      await expect(
        companions.connect(user2).verifyCompanion(tokenId)
      ).to.be.revertedWith("Not creator");
    });

    it("should revert when new owner (non-creator) tries to verify after transfer", async function () {
      const { companions, user1, user2 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      // Transfer to user2
      await companions.connect(user1).transferFrom(user1.address, user2.address, tokenId);

      // user2 is now owner but NOT creator
      await expect(
        companions.connect(user2).verifyCompanion(tokenId)
      ).to.be.revertedWith("Not creator");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // OWNER TRACKING
  // ─────────────────────────────────────────────────────────────────────────

  describe("Owner Tracking (getOwnerCompanions)", function () {
    it("should track owner companions after mint", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      await mintDefault(companions, user1);
      await mintDefault(companions, user1);

      const owned = await companions.getOwnerCompanions(user1.address);
      expect(owned.length).to.equal(2);
      expect(owned[0]).to.equal(1);
      expect(owned[1]).to.equal(2);
    });

    it("should update owner lists after transfer", async function () {
      const { companions, user1, user2 } = await loadFixture(deployCompanions);

      const tokenId = await mintDefault(companions, user1);
      await companions.connect(user1).transferFrom(user1.address, user2.address, tokenId);

      const user1Owned = await companions.getOwnerCompanions(user1.address);
      expect(user1Owned.length).to.equal(0);

      const user2Owned = await companions.getOwnerCompanions(user2.address);
      expect(user2Owned.length).to.equal(1);
      expect(user2Owned[0]).to.equal(tokenId);
    });

    it("should handle multiple transfers correctly (swap-and-pop)", async function () {
      const { companions, user1, user2 } = await loadFixture(deployCompanions);

      // Mint 3 companions to user1
      await mintDefault(companions, user1); // tokenId 1
      await mintDefault(companions, user1); // tokenId 2
      await mintDefault(companions, user1); // tokenId 3

      // Transfer the middle one (tokenId 2) to user2
      await companions.connect(user1).transferFrom(user1.address, user2.address, 2);

      const user1Owned = await companions.getOwnerCompanions(user1.address);
      expect(user1Owned.length).to.equal(2);
      // After swap-and-pop: tokenId 3 should replace tokenId 2's position
      const user1Set = user1Owned.map((id) => Number(id));
      expect(user1Set).to.include(1);
      expect(user1Set).to.include(3);
      expect(user1Set).to.not.include(2);

      const user2Owned = await companions.getOwnerCompanions(user2.address);
      expect(user2Owned.length).to.equal(1);
      expect(user2Owned[0]).to.equal(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ADMIN FUNCTIONS
  // ─────────────────────────────────────────────────────────────────────────

  describe("Admin Functions", function () {
    it("should allow owner to set mint price", async function () {
      const { companions, owner } = await loadFixture(deployCompanions);
      const newPrice = ethers.parseEther("0.5");

      await companions.connect(owner).setMintPrice(newPrice);
      expect(await companions.mintPrice()).to.equal(newPrice);
    });

    it("should revert setMintPrice with zero", async function () {
      const { companions, owner } = await loadFixture(deployCompanions);

      await expect(
        companions.connect(owner).setMintPrice(0)
      ).to.be.revertedWith("Price cannot be zero");
    });

    it("should revert setMintPrice from non-owner", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      await expect(
        companions.connect(user1).setMintPrice(ethers.parseEther("0.5"))
      ).to.be.revertedWithCustomError(companions, "OwnableUnauthorizedAccount");
    });

    it("should allow owner to set treasury", async function () {
      const { companions, owner, user1 } = await loadFixture(deployCompanions);

      await companions.connect(owner).setTreasury(user1.address);
      expect(await companions.treasury()).to.equal(user1.address);
    });

    it("should revert setTreasury with zero address", async function () {
      const { companions, owner } = await loadFixture(deployCompanions);

      await expect(
        companions.connect(owner).setTreasury(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid treasury");
    });

    it("should revert setTreasury from non-owner", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      await expect(
        companions.connect(user1).setTreasury(user1.address)
      ).to.be.revertedWithCustomError(companions, "OwnableUnauthorizedAccount");
    });

    it("should allow owner to pause and unpause", async function () {
      const { companions, owner, user1 } = await loadFixture(deployCompanions);

      await companions.connect(owner).pause();

      await expect(
        mintDefault(companions, user1)
      ).to.be.revertedWithCustomError(companions, "EnforcedPause");

      await companions.connect(owner).unpause();

      // Should succeed after unpause
      const tokenId = await mintDefault(companions, user1);
      expect(tokenId).to.equal(1);
    });

    it("should revert pause from non-owner", async function () {
      const { companions, user1 } = await loadFixture(deployCompanions);

      await expect(
        companions.connect(user1).pause()
      ).to.be.revertedWithCustomError(companions, "OwnableUnauthorizedAccount");
    });

    it("should revert unpause from non-owner", async function () {
      const { companions, owner, user1 } = await loadFixture(deployCompanions);

      await companions.connect(owner).pause();

      await expect(
        companions.connect(user1).unpause()
      ).to.be.revertedWithCustomError(companions, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // supportsInterface (ERC-8004)
  // ─────────────────────────────────────────────────────────────────────────

  describe("supportsInterface", function () {
    it("should support IERC8004 interface", async function () {
      const { companions } = await loadFixture(deployCompanions);

      // Compute IERC8004 interface ID from the function selectors
      const iface = new ethers.Interface([
        "function getAgentURI(uint256) view returns (string)",
        "function setAgentURI(uint256, string)",
        "function getAgentWallet(uint256) view returns (address)",
        "function setAgentWallet(uint256, address)",
        "function getMetadata(uint256, string) view returns (bytes)",
        "function setMetadata(uint256, string, bytes)",
      ]);

      // XOR of all function selectors = interface ID
      let interfaceId = 0n;
      iface.forEachFunction((fn) => {
        const selector = BigInt(fn.selector);
        interfaceId ^= selector;
      });
      const interfaceIdHex = "0x" + interfaceId.toString(16).padStart(8, "0");

      expect(await companions.supportsInterface(interfaceIdHex)).to.equal(true);
    });

    it("should support ERC721 interface", async function () {
      const { companions } = await loadFixture(deployCompanions);
      // ERC721 interface ID: 0x80ac58cd
      expect(await companions.supportsInterface("0x80ac58cd")).to.equal(true);
    });

    it("should support ERC165 interface", async function () {
      const { companions } = await loadFixture(deployCompanions);
      // ERC165 interface ID: 0x01ffc9a7
      expect(await companions.supportsInterface("0x01ffc9a7")).to.equal(true);
    });

    it("should not support a random interface", async function () {
      const { companions } = await loadFixture(deployCompanions);
      expect(await companions.supportsInterface("0xdeadbeef")).to.equal(false);
    });
  });
});
