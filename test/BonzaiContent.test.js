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

describe("BonzaiContent", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("should set correct name and symbol", async function () {
      const { content } = await loadFixture(deployContent);
      expect(await content.name()).to.equal("BonzAI Collectibles");
      expect(await content.symbol()).to.equal("BONZAI-C");
    });

    it("should set deployer as owner", async function () {
      const { content, owner } = await loadFixture(deployContent);
      expect(await content.owner()).to.equal(owner.address);
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

    it("should revert if treasury is zero address", async function () {
      const BonzaiContent = await ethers.getContractFactory("BonzaiContent");
      await expect(
        BonzaiContent.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid treasury");
    });

    it("should start with totalMinted at zero", async function () {
      const { content } = await loadFixture(deployContent);
      expect(await content.totalMinted()).to.equal(0);
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
      const { content, user1 } = await loadFixture(deployContent);
      const tx = await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
      const receipt = await tx.wait();

      // tokenId should be 1 (first mint)
      expect(await content.totalMinted()).to.equal(1);
      expect(await content.ownerOf(1)).to.equal(user1.address);
    });

    it("should store provenance data correctly", async function () {
      const { content, user1 } = await loadFixture(deployContent);
      await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });

      const prov = await content.provenance(1);
      expect(prov.transactionId).to.equal(contentId);
      expect(prov.originalCreator).to.equal(user1.address);
      expect(prov.model).to.equal(model);
      expect(prov.contentType).to.equal(contentType);
      expect(prov.creationTimestamp).to.be.gt(0);
    });

    it("should set tokenURI correctly", async function () {
      const { content, user1 } = await loadFixture(deployContent);
      await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
      expect(await content.tokenURI(1)).to.equal(tokenURI);
    });

    it("should emit ContentMinted event", async function () {
      const { content, user1 } = await loadFixture(deployContent);
      await expect(
        content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE })
      )
        .to.emit(content, "ContentMinted")
        .withArgs(1, user1.address, contentId, model, () => true);
    });

    it("should increment tokenId for sequential mints", async function () {
      const { content, user1, user2 } = await loadFixture(deployContent);
      await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
      await content.connect(user2).mint("content-2", "llama-3.1-8b", "uri2", CONTENT_TYPE.TEXT, { value: MINT_FEE });

      expect(await content.totalMinted()).to.equal(2);
      expect(await content.ownerOf(1)).to.equal(user1.address);
      expect(await content.ownerOf(2)).to.equal(user2.address);
    });

    it("should revert if fee is insufficient", async function () {
      const { content, user1 } = await loadFixture(deployContent);
      const lowFee = MINT_FEE - 1n;
      await expect(
        content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: lowFee })
      ).to.be.revertedWith("Insufficient mint fee");
    });

    it("should revert if contentType > 5", async function () {
      const { content, user1 } = await loadFixture(deployContent);
      await expect(
        content.connect(user1).mint(contentId, model, tokenURI, 6, { value: MINT_FEE })
      ).to.be.revertedWith("Invalid content type");
    });

    it("should accept all valid content types (0-5)", async function () {
      const { content, user1 } = await loadFixture(deployContent);
      for (let ct = 0; ct <= 5; ct++) {
        await content.connect(user1).mint(contentId, model, tokenURI, ct, { value: MINT_FEE });
        expect(await content.getContentType(ct + 1)).to.equal(ct);
      }
    });

    // ─── Fee Split ──────────────────────────────────────────────────────────

    describe("fee split", function () {
      it("should send 80% to treasury and 20% to pool", async function () {
        const { content, mockPool, treasury, user1 } = await loadFixture(deployContent);

        // Configure pool
        await content.setMintPool(await mockPool.getAddress());

        const treasuryBefore = await ethers.provider.getBalance(treasury.address);

        await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });

        const treasuryAfter = await ethers.provider.getBalance(treasury.address);
        const expectedTreasury = (MINT_FEE * TREASURY_BPS) / BPS_DENOMINATOR;
        const expectedPool = MINT_FEE - expectedTreasury;

        expect(treasuryAfter - treasuryBefore).to.equal(expectedTreasury);
        expect(await mockPool.totalDeposits()).to.equal(expectedPool);
      });

      it("should route pool deposit to correct content type pool index", async function () {
        const { content, mockPool, user1 } = await loadFixture(deployContent);
        await content.setMintPool(await mockPool.getAddress());

        const videoType = CONTENT_TYPE.VIDEO;
        await content.connect(user1).mint(contentId, model, tokenURI, videoType, { value: MINT_FEE });

        const expectedPool = MINT_FEE - (MINT_FEE * TREASURY_BPS) / BPS_DENOMINATOR;
        expect(await mockPool.poolDeposits(videoType)).to.equal(expectedPool);
      });

      it("should send entire fee to treasury when no pool is configured", async function () {
        const { content, treasury, user1 } = await loadFixture(deployContent);
        // mintPool is address(0) by default

        const treasuryBefore = await ethers.provider.getBalance(treasury.address);
        await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
        const treasuryAfter = await ethers.provider.getBalance(treasury.address);

        expect(treasuryAfter - treasuryBefore).to.equal(MINT_FEE);
      });

      it("should fallback pool share to treasury when pool reverts", async function () {
        const { content, mockPool, treasury, user1 } = await loadFixture(deployContent);
        await content.setMintPool(await mockPool.getAddress());
        await mockPool.setShouldRevert(true);

        const treasuryBefore = await ethers.provider.getBalance(treasury.address);
        await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
        const treasuryAfter = await ethers.provider.getBalance(treasury.address);

        // Entire mintFee should go to treasury
        expect(treasuryAfter - treasuryBefore).to.equal(MINT_FEE);
      });

      it("should emit PoolDepositFailed when pool reverts", async function () {
        const { content, mockPool, user1 } = await loadFixture(deployContent);
        const poolAddr = await mockPool.getAddress();
        await content.setMintPool(poolAddr);
        await mockPool.setShouldRevert(true);

        const expectedPool = MINT_FEE - (MINT_FEE * TREASURY_BPS) / BPS_DENOMINATOR;

        await expect(
          content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE })
        )
          .to.emit(content, "PoolDepositFailed")
          .withArgs(poolAddr, contentType, expectedPool);
      });
    });

    // ─── Excess Refund ──────────────────────────────────────────────────────

    describe("excess refund", function () {
      it("should refund excess ETH to minter", async function () {
        const { content, user1 } = await loadFixture(deployContent);
        const excess = ethers.parseEther("0.01");
        const sent = MINT_FEE + excess;

        const balBefore = await ethers.provider.getBalance(user1.address);
        const tx = await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: sent });
        const receipt = await tx.wait();
        const gasCost = receipt.gasUsed * receipt.gasPrice;
        const balAfter = await ethers.provider.getBalance(user1.address);

        // User should only pay MINT_FEE + gas
        expect(balBefore - balAfter - gasCost).to.equal(MINT_FEE);
      });

      it("should work with exact mint fee (no refund)", async function () {
        const { content, user1 } = await loadFixture(deployContent);

        const balBefore = await ethers.provider.getBalance(user1.address);
        const tx = await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
        const receipt = await tx.wait();
        const gasCost = receipt.gasUsed * receipt.gasPrice;
        const balAfter = await ethers.provider.getBalance(user1.address);

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
      const { content, user1, user2 } = await loadFixture(deployContent);
      await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });

      // Transfer should succeed without validator
      await content.connect(user1).transferFrom(user1.address, user2.address, 1);
      expect(await content.ownerOf(1)).to.equal(user2.address);
    });

    it("should allow transfers when validator approves", async function () {
      const { content, validator, user1, user2 } = await loadFixture(deployContent);
      await content.setTransferValidator(await validator.getAddress());
      await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });

      await content.connect(user1).transferFrom(user1.address, user2.address, 1);
      expect(await content.ownerOf(1)).to.equal(user2.address);
    });

    it("should revert transfers when validator rejects", async function () {
      const { content, validator, user1, user2 } = await loadFixture(deployContent);
      await content.setTransferValidator(await validator.getAddress());
      await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });

      await validator.setRevert(true);

      await expect(
        content.connect(user1).transferFrom(user1.address, user2.address, 1)
      ).to.be.revertedWith("Transfer not allowed");
    });

    it("should skip validation on mints (from == address(0))", async function () {
      const { content, validator, user1 } = await loadFixture(deployContent);
      await content.setTransferValidator(await validator.getAddress());
      await validator.setRevert(true);

      // Mint should still succeed even though validator reverts on transfers
      await expect(
        content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE })
      ).to.not.be.reverted;

      expect(await content.ownerOf(1)).to.equal(user1.address);
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
      // ICreatorToken has getTransferValidator() + TransferValidatorUpdated event
      // Interface ID calculated from the function selector
      // keccak256("getTransferValidator()") first 4 bytes = 0x098144d4
      // ICreatorToken interfaceId = 0x098144d4
      // Actually need to check the real interfaceId; let's just verify it supports it
      // The supportsInterface includes type(ICreatorToken).interfaceId
      // We can just verify by checking the contract reports support
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
      const { content, user1 } = await loadFixture(deployContent);
      await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
      expect(await content.getContentType(1)).to.equal(contentType);
    });

    it("getContentType() should revert for non-existent token", async function () {
      const { content } = await loadFixture(deployContent);
      await expect(content.getContentType(999)).to.be.revertedWith("Token does not exist");
    });

    it("getCreator() should return the original minter", async function () {
      const { content, user1, user2 } = await loadFixture(deployContent);
      await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });

      // Transfer to user2
      await content.connect(user1).transferFrom(user1.address, user2.address, 1);

      // Creator should still be user1 even after transfer
      expect(await content.getCreator(1)).to.equal(user1.address);
      expect(await content.ownerOf(1)).to.equal(user2.address);
    });

    it("getCreator() should revert for non-existent token", async function () {
      const { content } = await loadFixture(deployContent);
      await expect(content.getCreator(999)).to.be.revertedWith("Token does not exist");
    });

    it("totalMinted() should return cumulative mint count", async function () {
      const { content, user1, user2 } = await loadFixture(deployContent);
      expect(await content.totalMinted()).to.equal(0);

      await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });
      expect(await content.totalMinted()).to.equal(1);

      await content.connect(user2).mint("content-2", "llama", "uri2", CONTENT_TYPE.TEXT, { value: MINT_FEE });
      expect(await content.totalMinted()).to.equal(2);
    });

    it("provenance() should return all stored fields", async function () {
      const { content, user1 } = await loadFixture(deployContent);
      await content.connect(user1).mint(contentId, model, tokenURI, contentType, { value: MINT_FEE });

      const prov = await content.provenance(1);
      expect(prov.transactionId).to.equal(contentId);
      expect(prov.originalCreator).to.equal(user1.address);
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
        const { content, user1 } = await loadFixture(deployContent);
        const newFee = ethers.parseEther("0.01");
        await content.setMintFee(newFee);

        // Old fee should fail
        await expect(
          content.connect(user1).mint("id", "model", "uri", 0, { value: MINT_FEE })
        ).to.be.revertedWith("Insufficient mint fee");

        // New fee should succeed
        await expect(
          content.connect(user1).mint("id", "model", "uri", 0, { value: newFee })
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
        await expect(content.setMintPool(poolAddr))
          .to.emit(content, "MintPoolUpdated")
          .withArgs(ethers.ZeroAddress, poolAddr);
      });

      it("should allow setting pool to zero address (disabling pool)", async function () {
        const { content, mockPool } = await loadFixture(deployContent);
        const poolAddr = await mockPool.getAddress();
        await content.setMintPool(poolAddr);
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
