const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployContent } = require("./helpers/deploy");
const {
  MINT_FEE,
  TREASURY_BPS,
  POOL_BPS,
  ROYALTY_BPS,
  BPS_DENOMINATOR,
  CONTENT_TYPE,
} = require("./helpers/constants");

describe("BonzaiCollectibles", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // DEPLOYMENT & INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment & Initialization", function () {
    it("should set correct name from initialize parameter", async function () {
      const { content } = await loadFixture(deployContent);
      expect(await content.name()).to.equal("Test Collection");
      expect(await content.symbol()).to.equal("BNZC");
    });

    it("should set collection owner as Ownable owner", async function () {
      const { content, owner } = await loadFixture(deployContent);
      expect(await content.owner()).to.equal(owner.address);
    });

    it("should set collection owner", async function () {
      const { content, owner } = await loadFixture(deployContent);
      expect(await content.collectionOwner()).to.equal(owner.address);
    });

    it("should set treasury address", async function () {
      const { content, treasury } = await loadFixture(deployContent);
      expect(await content.treasury()).to.equal(treasury.address);
    });

    it("should set default fee and bps values", async function () {
      const { content } = await loadFixture(deployContent);
      expect(await content.mintFee()).to.equal(MINT_FEE);
      expect(await content.treasuryBps()).to.equal(TREASURY_BPS);
      expect(await content.poolBps()).to.equal(POOL_BPS);
      expect(await content.royaltyBps()).to.equal(ROYALTY_BPS);
    });

    it("should revert if initialize is called twice", async function () {
      const { content, owner, treasury } = await loadFixture(deployContent);
      await expect(
        content.initialize(owner.address, "Dup", treasury.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWith("Already initialized");
    });

    it("should revert if implementation is initialized directly", async function () {
      const { implementation, owner, treasury } = await loadFixture(deployContent);
      await expect(
        implementation.initialize(owner.address, "Dup", treasury.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWith("Already initialized");
    });

    it("should start with totalMinted at zero", async function () {
      const { content } = await loadFixture(deployContent);
      expect(await content.totalMinted()).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FACTORY
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Factory", function () {
    it("should return existing collection on second call", async function () {
      const { factory, content, owner } = await loadFixture(deployContent);
      const addr1 = await factory.collections(owner.address);
      // Call again — should return the same address
      const tx = await factory.getOrCreateCollection("Different Name");
      const receipt = await tx.wait();
      const addr2 = await factory.collections(owner.address);
      expect(addr1).to.equal(addr2);
    });

    it("should create separate collections for different users", async function () {
      const { factory, user1 } = await loadFixture(deployContent);
      await factory.connect(user1).getOrCreateCollection("User1 Collection");
      const addr = await factory.collections(user1.address);
      expect(addr).to.not.equal(ethers.ZeroAddress);
    });

    it("should track total collections", async function () {
      const { factory, user1 } = await loadFixture(deployContent);
      // Owner already has one
      expect(await factory.totalCollections()).to.equal(1);
      await factory.connect(user1).getOrCreateCollection("User1 Collection");
      expect(await factory.totalCollections()).to.equal(2);
    });

    it("getCollection should return zero for users without a collection", async function () {
      const { factory, user2 } = await loadFixture(deployContent);
      expect(await factory.getCollection(user2.address)).to.equal(ethers.ZeroAddress);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MINT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("mint()", function () {
    const contentId = "test-content-id-abc123";
    const model = "flux-schnell";
    const tokenURI = "ipfs://test-content-id-abc123";
    const contentType = CONTENT_TYPE.IMAGE;

    it("should mint a token and return tokenId 1", async function () {
      const { content, owner } = await loadFixture(deployContent);
      const tx = await content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
      await tx.wait();

      expect(await content.totalMinted()).to.equal(1);
      expect(await content.ownerOf(1)).to.equal(owner.address);
    });

    it("should revert when non-owner tries to mint", async function () {
      const { content, user1 } = await loadFixture(deployContent);
      await expect(
        content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE })
      ).to.be.revertedWith("Only collection owner can mint");
    });

    it("should store provenance data correctly", async function () {
      const { content, owner } = await loadFixture(deployContent);
      await content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });

      const prov = await content.provenance(1);
      expect(prov.transactionId).to.equal(contentId);
      expect(prov.originalCreator).to.equal(owner.address);
      expect(prov.model).to.equal(model);
      expect(prov.contentType).to.equal(contentType);
      expect(prov.creationTimestamp).to.be.gt(0);
    });

    it("should set tokenURI correctly", async function () {
      const { content, owner } = await loadFixture(deployContent);
      await content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
      expect(await content.tokenURI(1)).to.equal(tokenURI);
    });

    it("should emit ContentMinted event", async function () {
      const { content, owner } = await loadFixture(deployContent);
      await expect(
        content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE })
      )
        .to.emit(content, "ContentMinted")
        .withArgs(1, owner.address, contentId, model, () => true);
    });

    it("should increment tokenId for sequential mints", async function () {
      const { content, owner } = await loadFixture(deployContent);
      await content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
      await content.connect(owner).mint("content-2", "llama-3.1-8b", "uri2", CONTENT_TYPE.TEXT, { value: MINT_FEE });

      expect(await content.totalMinted()).to.equal(2);
      expect(await content.ownerOf(1)).to.equal(owner.address);
      expect(await content.ownerOf(2)).to.equal(owner.address);
    });

    it("should revert if fee is insufficient", async function () {
      const { content, owner } = await loadFixture(deployContent);
      const lowFee = MINT_FEE - 1n;
      await expect(
        content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: lowFee })
      ).to.be.revertedWith("Insufficient mint fee");
    });

    it("should revert if contentType > 5", async function () {
      const { content, owner } = await loadFixture(deployContent);
      await expect(
        content.connect(owner).mint(contentId, model, tokenURI, 6, { value: MINT_FEE })
      ).to.be.revertedWith("Invalid content type");
    });

    it("should accept all valid content types (0-5)", async function () {
      const { content, owner } = await loadFixture(deployContent);
      for (let ct = 0; ct <= 5; ct++) {
        await content.connect(owner).mint(contentId, model, tokenURI, ct, { value: MINT_FEE });
        expect(await content.getContentType(ct + 1)).to.equal(ct);
      }
    });

    // ─── Fee Split ──────────────────────────────────────────────────────────

    describe("fee split", function () {
      it("should send 80% to treasury and 20% to pool", async function () {
        const { content, mockPool, treasury, owner } = await loadFixture(deployContent);

        const treasuryBefore = await ethers.provider.getBalance(treasury.address);

        await content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });

        const treasuryAfter = await ethers.provider.getBalance(treasury.address);
        const expectedTreasury = (MINT_FEE * TREASURY_BPS) / BPS_DENOMINATOR;
        const expectedPool = MINT_FEE - expectedTreasury;

        expect(treasuryAfter - treasuryBefore).to.equal(expectedTreasury);
        expect(await mockPool.totalDeposits()).to.equal(expectedPool);
      });

      it("should route pool deposit to correct content type pool index", async function () {
        const { content, mockPool, owner } = await loadFixture(deployContent);

        const videoType = CONTENT_TYPE.VIDEO;
        await content.connect(owner).mint(contentId, model, tokenURI, videoType, { value: MINT_FEE });

        const expectedPool = MINT_FEE - (MINT_FEE * TREASURY_BPS) / BPS_DENOMINATOR;
        expect(await mockPool.poolDeposits(videoType)).to.equal(expectedPool);
      });

      it("should send entire fee to treasury when no pool is configured", async function () {
        const { factory, treasury, user1 } = await loadFixture(deployContent);

        // Create a new collection with no pool configured
        const BonzaiCollectibles = await ethers.getContractFactory("BonzaiCollectibles");
        const impl = await BonzaiCollectibles.deploy();
        const NoPoolFactory = await ethers.getContractFactory("BonzaiCollectiblesFactory");
        const noPoolFactory = await NoPoolFactory.deploy(
          await impl.getAddress(),
          treasury.address,
          ethers.ZeroAddress, // no pool
          ethers.ZeroAddress
        );
        await noPoolFactory.connect(user1).getOrCreateCollection("No Pool Collection");
        const cloneAddr = await noPoolFactory.collections(user1.address);
        const noPcolContent = BonzaiCollectibles.attach(cloneAddr);

        const treasuryBefore = await ethers.provider.getBalance(treasury.address);
        await noPcolContent.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
        const treasuryAfter = await ethers.provider.getBalance(treasury.address);

        expect(treasuryAfter - treasuryBefore).to.equal(MINT_FEE);
      });

      it("should fallback pool share to treasury when pool reverts", async function () {
        const { content, mockPool, treasury, owner } = await loadFixture(deployContent);
        await mockPool.setShouldRevert(true);

        const treasuryBefore = await ethers.provider.getBalance(treasury.address);
        await content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
        const treasuryAfter = await ethers.provider.getBalance(treasury.address);

        // Entire mintFee should go to treasury
        expect(treasuryAfter - treasuryBefore).to.equal(MINT_FEE);
      });

      it("should emit PoolDepositFailed when pool reverts", async function () {
        const { content, mockPool, owner } = await loadFixture(deployContent);
        const poolAddr = await mockPool.getAddress();
        await mockPool.setShouldRevert(true);

        const expectedPool = MINT_FEE - (MINT_FEE * TREASURY_BPS) / BPS_DENOMINATOR;

        await expect(
          content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE })
        )
          .to.emit(content, "PoolDepositFailed")
          .withArgs(poolAddr, contentType, expectedPool);
      });
    });

    // ─── Excess Refund ──────────────────────────────────────────────────────

    describe("excess refund", function () {
      it("should refund excess ETH to minter", async function () {
        const { content, owner } = await loadFixture(deployContent);
        const excess = ethers.parseEther("0.01");
        const sent = MINT_FEE + excess;

        const balBefore = await ethers.provider.getBalance(owner.address);
        const tx = await content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: sent });
        const receipt = await tx.wait();
        const gasCost = receipt.gasUsed * receipt.gasPrice;
        const balAfter = await ethers.provider.getBalance(owner.address);

        // User should only pay MINT_FEE + gas
        expect(balBefore - balAfter - gasCost).to.equal(MINT_FEE);
      });

      it("should work with exact mint fee (no refund)", async function () {
        const { content, owner } = await loadFixture(deployContent);

        const balBefore = await ethers.provider.getBalance(owner.address);
        const tx = await content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
        const receipt = await tx.wait();
        const gasCost = receipt.gasUsed * receipt.gasPrice;
        const balAfter = await ethers.provider.getBalance(owner.address);

        expect(balBefore - balAfter - gasCost).to.equal(MINT_FEE);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERC-2981 ROYALTIES
  // ═══════════════════════════════════════════════════════════════════════════

  describe("ERC-2981 royaltyInfo()", function () {
    it("should return 7.5% royalty", async function () {
      const { content } = await loadFixture(deployContent);
      const salePrice = ethers.parseEther("1");
      const [, royaltyAmount] = await content.royaltyInfo(1, salePrice);
      const expected = (salePrice * ROYALTY_BPS) / BPS_DENOMINATOR;
      expect(royaltyAmount).to.equal(expected);
    });

    it("should return treasury as receiver when no royaltySplitter is set", async function () {
      const { content, treasury } = await loadFixture(deployContent);
      const [receiver] = await content.royaltyInfo(1, ethers.parseEther("1"));
      // royaltySplitter is ZeroAddress in our fixture, so falls back to treasury
      expect(receiver).to.equal(treasury.address);
    });

    it("should return royaltySplitter as receiver when set", async function () {
      const { content, user1 } = await loadFixture(deployContent);
      await content.setRoyaltySplitter(user1.address);
      const [receiver] = await content.royaltyInfo(1, ethers.parseEther("1"));
      expect(receiver).to.equal(user1.address);
    });

    it("should support ERC-2981 interface", async function () {
      const { content } = await loadFixture(deployContent);
      // IERC2981 interfaceId = 0x2a55205a
      expect(await content.supportsInterface("0x2a55205a")).to.be.true;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERC721-C TRANSFER VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("ERC721-C Transfer Validation", function () {
    const contentId = "test-content-id";
    const model = "flux-schnell";
    const tokenURI = "ipfs://test-content-id";
    const contentType = CONTENT_TYPE.IMAGE;

    it("should allow transfers when no validator is set", async function () {
      const { content, owner, user1 } = await loadFixture(deployContent);
      await content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });

      await content.connect(owner).transferFrom(owner.address, user1.address, 1);
      expect(await content.ownerOf(1)).to.equal(user1.address);
    });

    it("should allow transfers when validator approves", async function () {
      const { content, validator, owner, user1 } = await loadFixture(deployContent);
      await content.setTransferValidator(await validator.getAddress());
      await content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });

      await content.connect(owner).transferFrom(owner.address, user1.address, 1);
      expect(await content.ownerOf(1)).to.equal(user1.address);
    });

    it("should revert transfers when validator rejects", async function () {
      const { content, validator, owner, user1 } = await loadFixture(deployContent);
      await content.setTransferValidator(await validator.getAddress());
      await content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });

      await validator.setRevert(true);

      await expect(
        content.connect(owner).transferFrom(owner.address, user1.address, 1)
      ).to.be.revertedWith("Transfer not allowed");
    });

    it("should skip validation on mints (from == address(0))", async function () {
      const { content, validator, owner } = await loadFixture(deployContent);
      await content.setTransferValidator(await validator.getAddress());
      await validator.setRevert(true);

      // Mint should still succeed even though validator reverts on transfers
      await expect(
        content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE })
      ).to.not.be.reverted;

      expect(await content.ownerOf(1)).to.equal(owner.address);
    });

    it("should expose getTransferValidator()", async function () {
      const { content, validator } = await loadFixture(deployContent);
      expect(await content.getTransferValidator()).to.equal(ethers.ZeroAddress);

      const validatorAddr = await validator.getAddress();
      await content.setTransferValidator(validatorAddr);
      expect(await content.getTransferValidator()).to.equal(validatorAddr);
    });

    it("should support ICreatorToken interface", async function () {
      const { content } = await loadFixture(deployContent);
      const iCreatorTokenId = "0x098144d4";
      expect(await content.supportsInterface(iCreatorTokenId)).to.be.true;
    });

    it("should emit TransferValidatorUpdated on setTransferValidator", async function () {
      const { content, validator } = await loadFixture(deployContent);
      const validatorAddr = await validator.getAddress();

      await expect(content.setTransferValidator(validatorAddr))
        .to.emit(content, "TransferValidatorUpdated")
        .withArgs(ethers.ZeroAddress, validatorAddr);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("View Functions", function () {
    const contentId = "view-test-content-id";
    const model = "kokoro-tts";
    const tokenURI = "ipfs://view-test-content-id";
    const contentType = CONTENT_TYPE.AUDIO;

    it("getContentType() should return the correct content type", async function () {
      const { content, owner } = await loadFixture(deployContent);
      await content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
      expect(await content.getContentType(1)).to.equal(contentType);
    });

    it("getContentType() should revert for non-existent token", async function () {
      const { content } = await loadFixture(deployContent);
      await expect(content.getContentType(999)).to.be.revertedWith("Token does not exist");
    });

    it("getCreator() should return the original minter", async function () {
      const { content, owner, user1 } = await loadFixture(deployContent);
      await content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });

      // Transfer to user1
      await content.connect(owner).transferFrom(owner.address, user1.address, 1);

      // Creator should still be owner even after transfer
      expect(await content.getCreator(1)).to.equal(owner.address);
      expect(await content.ownerOf(1)).to.equal(user1.address);
    });

    it("getCreator() should revert for non-existent token", async function () {
      const { content } = await loadFixture(deployContent);
      await expect(content.getCreator(999)).to.be.revertedWith("Token does not exist");
    });

    it("totalMinted() should return cumulative mint count", async function () {
      const { content, owner } = await loadFixture(deployContent);
      expect(await content.totalMinted()).to.equal(0);

      await content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
      expect(await content.totalMinted()).to.equal(1);

      await content.connect(owner).mint("content-2", "llama", "uri2", CONTENT_TYPE.TEXT, { value: MINT_FEE });
      expect(await content.totalMinted()).to.equal(2);
    });

    it("provenance() should return all stored fields", async function () {
      const { content, owner } = await loadFixture(deployContent);
      await content.connect(owner).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });

      const prov = await content.provenance(1);
      expect(prov.transactionId).to.equal(contentId);
      expect(prov.originalCreator).to.equal(owner.address);
      expect(prov.model).to.equal(model);
      expect(prov.contentType).to.equal(contentType);
      expect(prov.creationTimestamp).to.be.gt(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Admin Functions", function () {
    describe("setMintFee()", function () {
      it("should allow owner to set a new mint fee", async function () {
        const { content } = await loadFixture(deployContent);
        const newFee = ethers.parseEther("0.005");
        await content.setMintFee(newFee);
        expect(await content.mintFee()).to.equal(newFee);
      });

      it("should revert if fee is zero", async function () {
        const { content } = await loadFixture(deployContent);
        await expect(content.setMintFee(0)).to.be.revertedWith("Fee cannot be zero");
      });

      it("should revert if called by non-owner", async function () {
        const { content, user1 } = await loadFixture(deployContent);
        await expect(
          content.connect(user1).setMintFee(ethers.parseEther("0.01"))
        ).to.be.revertedWithCustomError(content, "OwnableUnauthorizedAccount");
      });

      it("should enforce the new fee on subsequent mints", async function () {
        const { content, owner } = await loadFixture(deployContent);
        const newFee = ethers.parseEther("0.01");
        await content.setMintFee(newFee);

        // Old fee should fail
        await expect(
          content.connect(owner).mint("id", "model", "uri", 0, { value: MINT_FEE })
        ).to.be.revertedWith("Insufficient mint fee");

        // New fee should succeed
        await expect(
          content.connect(owner).mint("id", "model", "uri", 0, { value: newFee })
        ).to.not.be.reverted;
      });
    });

    describe("setTreasury()", function () {
      it("should allow owner to update treasury", async function () {
        const { content, user1 } = await loadFixture(deployContent);
        await content.setTreasury(user1.address);
        expect(await content.treasury()).to.equal(user1.address);
      });

      it("should revert for zero address", async function () {
        const { content } = await loadFixture(deployContent);
        await expect(content.setTreasury(ethers.ZeroAddress)).to.be.revertedWith("Invalid treasury");
      });
    });

    describe("setMintPool()", function () {
      it("should allow owner to set mint pool", async function () {
        const { content, mockPool } = await loadFixture(deployContent);
        const poolAddr = await mockPool.getAddress();
        await content.setMintPool(poolAddr);
        expect(await content.mintPool()).to.equal(poolAddr);
      });

      it("should emit MintPoolUpdated event", async function () {
        const { content, mockPool } = await loadFixture(deployContent);
        const poolAddr = await mockPool.getAddress();
        // The clone was initialized with mockPool, so old == mockPool
        const oldPool = await content.mintPool();
        const newPoolAddr = await mockPool.getAddress();
        await expect(content.setMintPool(newPoolAddr))
          .to.emit(content, "MintPoolUpdated")
          .withArgs(oldPool, newPoolAddr);
      });

      it("should allow setting pool to zero address (disabling pool)", async function () {
        const { content } = await loadFixture(deployContent);
        await content.setMintPool(ethers.ZeroAddress);
        expect(await content.mintPool()).to.equal(ethers.ZeroAddress);
      });
    });

    describe("setRoyaltySplitter()", function () {
      it("should allow owner to set royalty splitter", async function () {
        const { content, user1 } = await loadFixture(deployContent);
        await content.setRoyaltySplitter(user1.address);
        expect(await content.royaltySplitter()).to.equal(user1.address);
      });

      it("should emit RoyaltySplitterUpdated event", async function () {
        const { content, user1 } = await loadFixture(deployContent);
        await expect(content.setRoyaltySplitter(user1.address))
          .to.emit(content, "RoyaltySplitterUpdated")
          .withArgs(ethers.ZeroAddress, user1.address);
      });
    });

    describe("setSplitBps()", function () {
      it("should allow owner to update split basis points", async function () {
        const { content } = await loadFixture(deployContent);
        await content.setSplitBps(7000, 3000);
        expect(await content.treasuryBps()).to.equal(7000n);
        expect(await content.poolBps()).to.equal(3000n);
      });

      it("should revert if bps do not sum to 10000", async function () {
        const { content } = await loadFixture(deployContent);
        await expect(content.setSplitBps(5000, 4000)).to.be.revertedWith("Must sum to 100%");
      });

      it("should emit SplitBpsUpdated event", async function () {
        const { content } = await loadFixture(deployContent);
        await expect(content.setSplitBps(9000, 1000))
          .to.emit(content, "SplitBpsUpdated")
          .withArgs(9000, 1000);
      });

      it("should allow 100% treasury / 0% pool", async function () {
        const { content } = await loadFixture(deployContent);
        await content.setSplitBps(10000, 0);
        expect(await content.treasuryBps()).to.equal(10000n);
        expect(await content.poolBps()).to.equal(0n);
      });

      it("should revert if called by non-owner", async function () {
        const { content, user1 } = await loadFixture(deployContent);
        await expect(
          content.connect(user1).setSplitBps(5000, 5000)
        ).to.be.revertedWithCustomError(content, "OwnableUnauthorizedAccount");
      });
    });

    describe("setRoyaltyBps()", function () {
      it("should allow owner to update royalty bps", async function () {
        const { content } = await loadFixture(deployContent);
        await content.setRoyaltyBps(500);
        expect(await content.royaltyBps()).to.equal(500n);
      });

      it("should allow maximum of 10% (1000 bps)", async function () {
        const { content } = await loadFixture(deployContent);
        await content.setRoyaltyBps(1000);
        expect(await content.royaltyBps()).to.equal(1000n);
      });

      it("should revert if royaltyBps > 1000 (10%)", async function () {
        const { content } = await loadFixture(deployContent);
        await expect(content.setRoyaltyBps(1001)).to.be.revertedWith("Max 10%");
      });

      it("should allow setting royalty to zero", async function () {
        const { content } = await loadFixture(deployContent);
        await content.setRoyaltyBps(0);
        expect(await content.royaltyBps()).to.equal(0n);

        const [, royaltyAmount] = await content.royaltyInfo(1, ethers.parseEther("1"));
        expect(royaltyAmount).to.equal(0n);
      });
    });

    describe("setTransferValidator()", function () {
      it("should allow owner to set transfer validator", async function () {
        const { content, validator } = await loadFixture(deployContent);
        const addr = await validator.getAddress();
        await content.setTransferValidator(addr);
        expect(await content.getTransferValidator()).to.equal(addr);
      });

      it("should allow disabling validator by setting to zero address", async function () {
        const { content, validator } = await loadFixture(deployContent);
        await content.setTransferValidator(await validator.getAddress());
        await content.setTransferValidator(ethers.ZeroAddress);
        expect(await content.getTransferValidator()).to.equal(ethers.ZeroAddress);
      });

      it("should revert if called by non-owner", async function () {
        const { content, validator, user1 } = await loadFixture(deployContent);
        await expect(
          content.connect(user1).setTransferValidator(await validator.getAddress())
        ).to.be.revertedWithCustomError(content, "OwnableUnauthorizedAccount");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERC-165 INTERFACE SUPPORT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("ERC-165 supportsInterface()", function () {
    it("should support ERC-721", async function () {
      const { content } = await loadFixture(deployContent);
      // ERC721 interfaceId = 0x80ac58cd
      expect(await content.supportsInterface("0x80ac58cd")).to.be.true;
    });

    it("should support ERC-721Metadata", async function () {
      const { content } = await loadFixture(deployContent);
      // ERC721Metadata interfaceId = 0x5b5e139f
      expect(await content.supportsInterface("0x5b5e139f")).to.be.true;
    });

    it("should support ERC-2981", async function () {
      const { content } = await loadFixture(deployContent);
      expect(await content.supportsInterface("0x2a55205a")).to.be.true;
    });

    it("should support ERC-165 itself", async function () {
      const { content } = await loadFixture(deployContent);
      // ERC165 interfaceId = 0x01ffc9a7
      expect(await content.supportsInterface("0x01ffc9a7")).to.be.true;
    });
  });
});
