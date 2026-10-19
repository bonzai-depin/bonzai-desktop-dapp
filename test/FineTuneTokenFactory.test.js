const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFineTuneTokenFactory } = require("./helpers/deploy");
const {
  TOTAL_SUPPLY,
  BURN_ADDRESS,
  MIN_ETH_LIQUIDITY,
  POOL_TYPE_FINETUNE,
} = require("./helpers/constants");

function launchValidatedModel(factory, contentCollection, tokenId, name, symbol, metadataURI, creator, overrides) {
  return factory.launchValidatedToken(contentCollection, tokenId, name, symbol, metadataURI,
    "Publisher-declared model", "ipfs://image", "fine_tuned", ethers.id("validation"), creator, overrides);
}

describe("FineTuneTokenFactory", function () {
  describe("Collection identity", function () {
    async function collectionFixture() {
      const f = await deployFineTuneTokenFactory();
      await f.mockContent.mintTo(f.owner.address);
      await f.collectiblesFactory.connect(f.user1).getOrCreateCollection("Another model collection");
      const secondAddress = await f.collectiblesFactory.collections(f.user1.address);
      const second = await ethers.getContractAt("MockBonzaiContent", secondAddress);
      await second.mintTo(f.user1.address);
      return { ...f, second, secondAddress };
    }

    it("issues independent models for the same token ID in two canonical collections", async function () {
      const f = await loadFixture(collectionFixture);
      await launchValidatedModel(f.factory, f.contentCollection, 1, "First", "ONE", "ipfs://one", f.owner.address, { value: MIN_ETH_LIQUIDITY });
      await launchValidatedModel(f.factory.connect(f.user1), f.secondAddress, 1, "Second", "TWO", "ipfs://two", f.user1.address, { value: MIN_ETH_LIQUIDITY });
      const first = await f.factory.getToken(f.contentCollection, 1);
      const second = await f.factory.getToken(f.secondAddress, 1);
      expect(first).to.not.equal(second);
      const token = await ethers.getContractAt("FineTuneToken", first);
      expect(await token.contentCollection()).to.equal(f.contentCollection);
      expect(await token.contentTokenId()).to.equal(1);
      expect(await f.factory.modelTokens(f.secondAddress, 1)).to.equal(second);
      expect(await f.factory.totalTokensLaunched()).to.equal(2);
    });

    it("rejects an NFT outside the canonical factory even when the caller owns it", async function () {
      const f = await loadFixture(collectionFixture);
      const NFT = await ethers.getContractFactory("MockBonzaiContent");
      const rogue = await NFT.deploy();
      await rogue.mintTo(f.owner.address);
      expect(await f.collectiblesFactory.isCollection(await rogue.getAddress())).to.equal(false);
      await expect(launchValidatedModel(f.factory, await rogue.getAddress(), 1, "Fake", "FAKE", "ipfs://fake", f.owner.address, { value: MIN_ETH_LIQUIDITY })).to.be.revertedWith("Unregistered collection");
      expect(await f.factory.totalTokensLaunched()).to.equal(0);
    });

    it("lets the current NFT owner publish after transfer, while denying the former owner", async function () {
      const f = await loadFixture(collectionFixture);
      await f.mockContent.transferFrom(f.owner.address, f.user1.address, 1);
      await expect(launchValidatedModel(f.factory, f.contentCollection, 1, "Transferred", "OWN", "ipfs://owned", f.owner.address, { value: MIN_ETH_LIQUIDITY })).to.be.revertedWith("Not NFT owner");
      await launchValidatedModel(f.factory.connect(f.user1), f.contentCollection, 1, "Transferred", "OWN", "ipfs://owned", f.user1.address, { value: MIN_ETH_LIQUIDITY });
      expect(await f.factory.hasToken(f.contentCollection, 1)).to.equal(true);
    });

    it("does not allow transfer to reset the one-token-per-NFT constraint", async function () {
      const f = await loadFixture(collectionFixture);
      await launchValidatedModel(f.factory, f.contentCollection, 1, "Original", "OLD", "ipfs://old", f.owner.address, { value: MIN_ETH_LIQUIDITY });
      await f.mockContent.transferFrom(f.owner.address, f.user1.address, 1);
      await expect(launchValidatedModel(f.factory.connect(f.user1), f.contentCollection, 1, "Duplicate", "DUP", "ipfs://dup", f.user1.address, { value: MIN_ETH_LIQUIDITY })).to.be.revertedWith("Token already launched for this model");
    });

    it("registers only deployed clones and preserves membership after collection ownership transfer", async function () {
      const [owner, newOwner] = await ethers.getSigners();
      const NFT = await ethers.getContractFactory("BonzaiCollectibles");
      const implementation = await NFT.deploy();
      const Factory = await ethers.getContractFactory("BonzaiCollectiblesFactory");
      const registry = await Factory.deploy(await implementation.getAddress(), owner.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress);
      expect(await registry.isCollection(await implementation.getAddress())).to.equal(false);
      expect(await registry.isCollection(owner.address)).to.equal(false);
      await registry.getOrCreateCollection("Original");
      const address = await registry.collections(owner.address);
      expect(await registry.isCollection(address)).to.equal(true);
      await registry.getOrCreateCollection("Repeated");
      expect(await registry.totalCollections()).to.equal(1);
      const collection = NFT.attach(address);
      await collection.transferOwnership(newOwner.address);
      expect(await registry.isCollection(address)).to.equal(true);
      expect(await registry.collections(owner.address)).to.equal(address);
    });

    it("rejects an EOA or implementation as the canonical collection registry", async function () {
      const f = await loadFixture(collectionFixture);
      await expect(f.factory.setContentContract(f.owner.address)).to.be.revertedWith("Invalid collection factory");
      await expect(f.factory.setContentContract(await f.contentImplementation.getAddress())).to.be.reverted;
      expect(await f.factory.contentContract()).to.equal(await f.collectiblesFactory.getAddress());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("should set deployer as owner", async function () {
      const { factory, contentCollection, owner } = await loadFixture(deployFineTuneTokenFactory);
      expect(await factory.owner()).to.equal(owner.address);
    });

    it("should set correct immutable addresses", async function () {
      const { factory, contentCollection, poolManager, positionManager, permit2, feeHook } =
        await loadFixture(deployFineTuneTokenFactory);

      expect(await factory.poolManager()).to.equal(await poolManager.getAddress());
      expect(await factory.positionManager()).to.equal(await positionManager.getAddress());
      expect(await factory.permit2()).to.equal(await permit2.getAddress());
    });

    it("should set default minEthLiquidity to 0.01 ether", async function () {
      const { factory, contentCollection } = await loadFixture(deployFineTuneTokenFactory);
      expect(await factory.minEthLiquidity()).to.equal(MIN_ETH_LIQUIDITY);
    });

    it("disables unvalidated model issuance at deployment", async function () {
      const {factory} = await loadFixture(deployFineTuneTokenFactory);
      expect(await factory.legacyLaunchEnabled()).to.equal(false);
    });

    it("should start with zero tokens launched", async function () {
      const { factory, contentCollection } = await loadFixture(deployFineTuneTokenFactory);
      expect(await factory.totalTokensLaunched()).to.equal(0);
    });

    it("should revert if constructor receives zero PoolManager address", async function () {
      const [, pm, p2, fh] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("FineTuneTokenFactory");
      await expect(
        Factory.deploy(ethers.ZeroAddress, pm.address, p2.address)
      ).to.be.revertedWith("Invalid PoolManager");
    });

    it("should revert if constructor receives zero Permit2 address", async function () {
      const [, pm, posm, p2] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("FineTuneTokenFactory");
      await expect(
        Factory.deploy(pm.address, posm.address, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid Permit2");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // launchToken()
  // ═══════════════════════════════════════════════════════════════════════════

  describe("launchToken()", function () {
    const tokenName = "BonzAI Fine-Tune: TestModel";
    const tokenSymbol = "BZTEST";
    const modelIrysHash = "arweave-hash-abc123";

    async function launchFixture() {
      const deployed = await deployFineTuneTokenFactory();
      const { factory, contentCollection, mockContent, owner, creator } = deployed;

      // Mint a content NFT to the owner (who will call launchToken)
      const mintTx = await mockContent.mintTo(owner.address);
      const receipt = await mintTx.wait();
      const contentTokenId = 1n;

      return { ...deployed, contentTokenId };
    }

    it("issues a fine-tuned model token with publisher-declared metadata", async function () {
      const { factory, contentCollection, contentTokenId, creator } = await loadFixture(launchFixture);
      const validationHash = ethers.id("validated-model-artifacts");
      await factory.launchValidatedToken(
        contentCollection,
        contentTokenId,
        "BonzAI Research Model",
        "BZRM",
        "ipfs://model-metadata",
        "A locally trained research assistant with attributable dataset lineage.",
        "ipfs://model-image",
        "fine_tuned",
        validationHash,
        creator.address,
        { value: MIN_ETH_LIQUIDITY },
      );
      const token = await ethers.getContractAt("FineTuneToken", await factory.getToken(contentCollection, contentTokenId));
      const profile = await token.getModelProfile();
      expect(profile.description_).to.include("attributable dataset lineage");
      expect(profile.modelKind_).to.equal("fine_tuned");
      expect(profile.validationHash_).to.equal(validationHash);
    });

    it("supports publisher-declared abliterated model tokens and disables legacy issuance", async function () {
      const { factory, contentCollection, contentTokenId, creator } = await loadFixture(launchFixture);
      await factory.disableLegacyLaunch();
      await expect(
        factory.launchToken(contentTokenId, tokenName, tokenSymbol, modelIrysHash, creator.address, { value: MIN_ETH_LIQUIDITY }),
      ).to.be.revertedWith("Use validated model launch");
      await factory.launchValidatedToken(
        contentCollection,
        contentTokenId, "BonzAI Open Model", "BZOPEN", "ipfs://metadata",
        "A publisher-declared abliterated model.", "ipfs://image", "abliterated",
        ethers.id("abliteration-validation"), creator.address, { value: MIN_ETH_LIQUIDITY },
      );
      const token = await ethers.getContractAt("FineTuneToken", await factory.getToken(contentCollection, contentTokenId));
      expect(await token.modelKind()).to.equal("abliterated");
    });

    it("should deploy a FineTuneToken and return its address", async function () {
      const { factory, contentCollection, contentTokenId, creator } = await loadFixture(launchFixture);

      const tx = await launchValidatedModel(factory, contentCollection,
        contentTokenId,
        tokenName,
        tokenSymbol,
        modelIrysHash,
        creator.address,
        { value: MIN_ETH_LIQUIDITY }
      );
      const receipt = await tx.wait();

      const tokenAddr = await factory.getToken(contentCollection, contentTokenId);
      expect(tokenAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("should allocate 96% of supply to liquidity and 4% to creator", async function () {
      const { factory, contentCollection, contentTokenId, creator } = await loadFixture(launchFixture);

      await launchValidatedModel(factory, contentCollection,
        contentTokenId,
        tokenName,
        tokenSymbol,
        modelIrysHash,
        creator.address,
        { value: MIN_ETH_LIQUIDITY }
      );

      const tokenAddr = await factory.getToken(contentCollection, contentTokenId);
      const token = await ethers.getContractAt("FineTuneToken", tokenAddr);

      const creatorBalance = await token.balanceOf(creator.address);
      const expectedCreatorAmount = (TOTAL_SUPPLY * 400n) / 10000n; // 4%
      expect(creatorBalance).to.equal(expectedCreatorAmount);
    });

    it("uses a vault without a hook or second fee deduction", async function () {
      const { factory, contentCollection, feeHook, contentTokenId, creator } = await loadFixture(launchFixture);
      const tx = await launchValidatedModel(factory,contentCollection,contentTokenId,tokenName,tokenSymbol,modelIrysHash,creator.address,{value:MIN_ETH_LIQUIDITY});
      const receipt=await tx.wait();
      const event=receipt.logs.map(l=>{try{return factory.interface.parseLog(l)}catch{return null}}).find(l=>l?.name==='ModelTokenLaunched');
      const reg=await feeHook.getRegistration(event.args.poolId);
      expect(reg.beneficiary).to.equal(ethers.ZeroAddress);
      const vault=await ethers.getContractAt('BonzaiLiquidityVault',await factory.liquidityVault());
      expect((await vault.positions(event.args.positionId)).beneficiary).to.equal(creator.address);
      expect(await vault.TRADING_FEE()).to.equal(10000);
    });

    it("should emit ModelTokenLaunched event with correct args", async function () {
      const { factory, contentCollection, contentTokenId, creator } = await loadFixture(launchFixture);

      await expect(
        launchValidatedModel(factory, contentCollection,
          contentTokenId,
          tokenName,
          tokenSymbol,
          modelIrysHash,
          creator.address,
          { value: MIN_ETH_LIQUIDITY }
        )
      ).to.emit(factory, "ModelTokenLaunched");
    });

    it("should lock LP position NFT in the immutable vault", async function () {
      const { factory, contentCollection, positionManager, contentTokenId, creator } =
        await loadFixture(launchFixture);

      const tx = await launchValidatedModel(factory, contentCollection,
        contentTokenId,
        tokenName,
        tokenSymbol,
        modelIrysHash,
        creator.address,
        { value: MIN_ETH_LIQUIDITY }
      );
      const receipt = await tx.wait();

      // The position NFT (tokenId=1) should be owned by BURN_ADDRESS
      const positionOwner = await positionManager.ownerOf(1);
      expect(positionOwner).to.equal(await factory.liquidityVault());
    });

    it("should increment totalTokensLaunched after each launch", async function () {
      const { factory, contentCollection, mockContent, owner, creator } = await loadFixture(launchFixture);

      // Launch first token (contentTokenId=1 already minted)
      await launchValidatedModel(factory, contentCollection, 1, tokenName, tokenSymbol, modelIrysHash, creator.address, {
        value: MIN_ETH_LIQUIDITY,
      });
      expect(await factory.totalTokensLaunched()).to.equal(1);

      // Mint second content NFT and launch
      await mockContent.mintTo(owner.address);
      await launchValidatedModel(factory, contentCollection, 2, "Model2", "BZM2", "hash2", creator.address, {
        value: MIN_ETH_LIQUIDITY,
      });
      expect(await factory.totalTokensLaunched()).to.equal(2);
    });

    // ─── Validation ──────────────────────────────────────────────────────────

    it("should revert if msg.value < minEthLiquidity", async function () {
      const { factory, contentCollection, contentTokenId, creator } = await loadFixture(launchFixture);
      const tooLow = MIN_ETH_LIQUIDITY - 1n;

      await expect(
        launchValidatedModel(factory, contentCollection,
          contentTokenId,
          tokenName,
          tokenSymbol,
          modelIrysHash,
          creator.address,
          { value: tooLow }
        )
      ).to.be.revertedWith("Insufficient ETH for liquidity");
    });

    it("should revert if token already launched for content token (no duplicates)", async function () {
      const { factory, contentCollection, contentTokenId, creator } = await loadFixture(launchFixture);

      // Launch first time
      await launchValidatedModel(factory, contentCollection,
        contentTokenId,
        tokenName,
        tokenSymbol,
        modelIrysHash,
        creator.address,
        { value: MIN_ETH_LIQUIDITY }
      );

      // Attempt duplicate
      await expect(
        launchValidatedModel(factory, contentCollection,
          contentTokenId,
          "Another",
          "DUP",
          "hash2",
          creator.address,
          { value: MIN_ETH_LIQUIDITY }
        )
      ).to.be.revertedWith("Token already launched for this model");
    });

    it("should revert if creator is zero address", async function () {
      const { factory, contentCollection, contentTokenId } = await loadFixture(launchFixture);

      await expect(
        launchValidatedModel(factory, contentCollection,
          contentTokenId,
          tokenName,
          tokenSymbol,
          modelIrysHash,
          ethers.ZeroAddress,
          { value: MIN_ETH_LIQUIDITY }
        )
      ).to.be.revertedWith("Invalid creator address");
    });

    it("should revert if caller is not NFT owner", async function () {
      const { factory, contentCollection, contentTokenId, user1, creator } = await loadFixture(launchFixture);

      // user1 does not own contentTokenId=1 (owner does)
      await expect(
        launchValidatedModel(factory.connect(user1), contentCollection,
          contentTokenId,
          tokenName,
          tokenSymbol,
          modelIrysHash,
          creator.address,
          { value: MIN_ETH_LIQUIDITY }
        )
      ).to.be.revertedWith("Not NFT owner");
    });

    it("should revert if symbol is empty", async function () {
      const { factory, contentCollection, contentTokenId, creator } = await loadFixture(launchFixture);

      await expect(
        launchValidatedModel(factory, contentCollection,
          contentTokenId,
          tokenName,
          "",
          modelIrysHash,
          creator.address,
          { value: MIN_ETH_LIQUIDITY }
        )
      ).to.be.revertedWith("Symbol required");
    });

    it("should revert if name is empty", async function () {
      const { factory, contentCollection, contentTokenId, creator } = await loadFixture(launchFixture);

      await expect(
        launchValidatedModel(factory, contentCollection,
          contentTokenId,
          "",
          tokenSymbol,
          modelIrysHash,
          creator.address,
          { value: MIN_ETH_LIQUIDITY }
        )
      ).to.be.revertedWith("Name required");
    });

    it("should revert if contentContract is not set", async function () {
      const [owner, user1, creator] = await ethers.getSigners();

      // Deploy factory without setting contentContract
      const MockPoolManager = await ethers.getContractFactory("MockPoolManager");
      const poolManager = await MockPoolManager.deploy();
      const MockPositionManager = await ethers.getContractFactory("MockPositionManager");
      const positionManager = await MockPositionManager.deploy();
      const MockPermit2 = await ethers.getContractFactory("MockPermit2");
      const permit2 = await MockPermit2.deploy();
      const MockFeeHook = await ethers.getContractFactory("MockFeeHook");
      const feeHook = await MockFeeHook.deploy();

      const Factory = await ethers.getContractFactory("FineTuneTokenFactory");
      const factory = await Factory.deploy(
        await poolManager.getAddress(),
        await positionManager.getAddress(),
        await permit2.getAddress()
      );

      const rewards=await (await ethers.getContractFactory("MockVaultRewards")).deploy();
      await factory.configureLiquidityVault(owner.address,await rewards.getAddress());
      const contentCollection = owner.address;
      // Do NOT call setContentContract
      await expect(
        launchValidatedModel(factory, contentCollection, 1, tokenName, tokenSymbol, modelIrysHash, creator.address, {
          value: MIN_ETH_LIQUIDITY,
        })
      ).to.be.revertedWith("Content contract not set");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FineTuneToken
  // ═══════════════════════════════════════════════════════════════════════════

  describe("FineTuneToken", function () {
    const tokenName = "BonzAI Fine-Tune: MetaModel";
    const tokenSymbol = "BZMETA";
    const modelIrysHash = "irys-hash-meta-xyz";

    async function tokenFixture() {
      const deployed = await deployFineTuneTokenFactory();
      const { factory, contentCollection, mockContent, owner, creator } = deployed;

      await mockContent.mintTo(owner.address);
      const contentTokenId = 1n;

      await launchValidatedModel(factory, contentCollection,
        contentTokenId,
        tokenName,
        tokenSymbol,
        modelIrysHash,
        creator.address,
        { value: MIN_ETH_LIQUIDITY }
      );

      const tokenAddr = await factory.getToken(contentCollection, contentTokenId);
      const token = await ethers.getContractAt("FineTuneToken", tokenAddr);

      return { ...deployed, contentTokenId, token, tokenAddr };
    }

    it("should have correct total supply of 1 billion tokens", async function () {
      const { token } = await loadFixture(tokenFixture);
      expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
    });

    it("should return correct metadata from getTokenInfo()", async function () {
      const { token, creator, contentTokenId } = await loadFixture(tokenFixture);

      const info = await token.getTokenInfo();
      expect(info.name_).to.equal(tokenName);
      expect(info.symbol_).to.equal(tokenSymbol);
      expect(info.decimals_).to.equal(18);
      expect(info.contentTokenId_).to.equal(contentTokenId);
      expect(info.modelIrysHash_).to.equal(modelIrysHash);
      expect(info.creator_).to.equal(creator.address);
    });

    it("should set factory as the deployer address", async function () {
      const { token, factory } = await loadFixture(tokenFixture);
      expect(await token.factory()).to.equal(await factory.getAddress());
    });

    it("should set deployedAt to block timestamp", async function () {
      const { token } = await loadFixture(tokenFixture);
      const deployedAt = await token.deployedAt();
      expect(deployedAt).to.be.gt(0);
    });

    it("should be burnable (ERC20Burnable)", async function () {
      const { token, creator } = await loadFixture(tokenFixture);

      const balBefore = await token.balanceOf(creator.address);
      expect(balBefore).to.be.gt(0);

      const burnAmount = ethers.parseEther("1000");
      await token.connect(creator).burn(burnAmount);

      const balAfter = await token.balanceOf(creator.address);
      expect(balAfter).to.equal(balBefore - burnAmount);

      // Total supply should also decrease
      expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY - burnAmount);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("View Functions", function () {
    const tokenName = "BonzAI Fine-Tune: ViewTest";
    const tokenSymbol = "BZVT";
    const modelIrysHash = "irys-hash-view-test";

    async function viewFixture() {
      const deployed = await deployFineTuneTokenFactory();
      const { factory, contentCollection, mockContent, owner, creator } = deployed;

      await mockContent.mintTo(owner.address);
      const contentTokenId = 1n;

      await launchValidatedModel(factory, contentCollection,
        contentTokenId,
        tokenName,
        tokenSymbol,
        modelIrysHash,
        creator.address,
        { value: MIN_ETH_LIQUIDITY }
      );

      return { ...deployed, contentTokenId };
    }

    it("hasToken() should return true for launched content token", async function () {
      const { factory, contentCollection, contentTokenId } = await loadFixture(viewFixture);
      expect(await factory.hasToken(contentCollection, contentTokenId)).to.be.true;
    });

    it("hasToken() should return false for non-launched content token", async function () {
      const { factory, contentCollection } = await loadFixture(viewFixture);
      expect(await factory.hasToken(contentCollection, 999)).to.be.false;
    });

    it("getToken() should return the deployed token address", async function () {
      const { factory, contentCollection, contentTokenId } = await loadFixture(viewFixture);
      const tokenAddr = await factory.getToken(contentCollection, contentTokenId);
      expect(tokenAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("getToken() should return zero address for non-launched content token", async function () {
      const { factory, contentCollection } = await loadFixture(viewFixture);
      expect(await factory.getToken(contentCollection, 999)).to.equal(ethers.ZeroAddress);
    });

    it("totalTokensLaunched() should reflect accurate count", async function () {
      const { factory, contentCollection, mockContent, owner, creator } = await loadFixture(viewFixture);

      // Already launched 1
      expect(await factory.totalTokensLaunched()).to.equal(1);

      // Launch a second
      await mockContent.mintTo(owner.address);
      await launchValidatedModel(factory, contentCollection, 2, "Model2", "BZM2", "hash2", creator.address, {
        value: MIN_ETH_LIQUIDITY,
      });
      expect(await factory.totalTokensLaunched()).to.equal(2);
    });

    it("getAllTokens() should return all launched token addresses", async function () {
      const { factory, contentCollection, mockContent, owner, creator, contentTokenId } =
        await loadFixture(viewFixture);

      const firstToken = await factory.getToken(contentCollection, contentTokenId);

      // Launch a second token
      await mockContent.mintTo(owner.address);
      await launchValidatedModel(factory, contentCollection, 2, "Model2", "BZM2", "hash2", creator.address, {
        value: MIN_ETH_LIQUIDITY,
      });
      const secondToken = await factory.getToken(contentCollection, 2);

      const allTokens = await factory.getAllTokens();
      expect(allTokens.length).to.equal(2);
      expect(allTokens[0]).to.equal(firstToken);
      expect(allTokens[1]).to.equal(secondToken);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Admin Functions", function () {
    describe("setContentContract()", function () {
      it("should allow owner to set content contract", async function () {
        const { factory, contentCollection, owner } = await loadFixture(deployFineTuneTokenFactory);
        const { collectiblesFactory } = await deployFineTuneTokenFactory();
        const newAddr = await collectiblesFactory.getAddress();
        await factory.connect(owner).setContentContract(newAddr);
        expect(await factory.contentContract()).to.equal(newAddr);
      });

      it("should revert if setting to zero address", async function () {
        const { factory, contentCollection } = await loadFixture(deployFineTuneTokenFactory);
        await expect(
          factory.setContentContract(ethers.ZeroAddress)
        ).to.be.revertedWith("Invalid collection factory");
      });

      it("should revert if called by non-owner", async function () {
        const { factory, contentCollection, user1 } = await loadFixture(deployFineTuneTokenFactory);
        const addr = ethers.Wallet.createRandom().address;
        await expect(
          factory.connect(user1).setContentContract(addr)
        ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      });
    });

    describe("setMinEthLiquidity()", function () {
      it("should allow owner to update min ETH liquidity", async function () {
        const { factory, contentCollection } = await loadFixture(deployFineTuneTokenFactory);
        const newMin = ethers.parseEther("0.05");
        await factory.setMinEthLiquidity(newMin);
        expect(await factory.minEthLiquidity()).to.equal(newMin);
      });

      it("should emit MinEthLiquidityUpdated event", async function () {
        const { factory, contentCollection } = await loadFixture(deployFineTuneTokenFactory);
        const newMin = ethers.parseEther("0.05");
        await expect(factory.setMinEthLiquidity(newMin))
          .to.emit(factory, "MinEthLiquidityUpdated")
          .withArgs(MIN_ETH_LIQUIDITY, newMin);
      });

      it("should revert if new min is zero", async function () {
        const { factory, contentCollection } = await loadFixture(deployFineTuneTokenFactory);
        await expect(factory.setMinEthLiquidity(0)).to.be.revertedWith("Min must be positive");
      });

      it("should revert if called by non-owner", async function () {
        const { factory, contentCollection, user1 } = await loadFixture(deployFineTuneTokenFactory);
        await expect(
          factory.connect(user1).setMinEthLiquidity(ethers.parseEther("1"))
        ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      });

      it("should enforce updated minEthLiquidity on subsequent launches", async function () {
        const { factory, contentCollection, mockContent, owner, creator } =
          await loadFixture(deployFineTuneTokenFactory);

        // Increase min to 1 ETH
        const highMin = ethers.parseEther("1");
        await factory.setMinEthLiquidity(highMin);

        await mockContent.mintTo(owner.address);

        // Old amount should fail
        await expect(
          launchValidatedModel(factory, contentCollection, 1, "Test", "TST", "hash", creator.address, {
            value: MIN_ETH_LIQUIDITY,
          })
        ).to.be.revertedWith("Insufficient ETH for liquidity");

        // New amount should succeed
        await expect(
          launchValidatedModel(factory, contentCollection, 1, "Test", "TST", "hash", creator.address, {
            value: highMin,
          })
        ).to.not.be.reverted;
      });
    });
  });
});
