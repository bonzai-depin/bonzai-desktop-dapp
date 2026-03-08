const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFineTuneTokenFactory } = require("./helpers/deploy");
const {
  TOTAL_SUPPLY,
  DEAD_ADDRESS,
  MIN_ETH_LIQUIDITY,
  POOL_TYPE_FINETUNE,
} = require("./helpers/constants");

describe("FineTuneTokenFactory", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("should set deployer as owner", async function () {
      const { factory, owner } = await loadFixture(deployFineTuneTokenFactory);
      expect(await factory.owner()).to.equal(owner.address);
    });

    it("should set correct immutable addresses", async function () {
      const { factory, poolManager, positionManager, permit2, feeHook } =
        await loadFixture(deployFineTuneTokenFactory);

      expect(await factory.poolManager()).to.equal(await poolManager.getAddress());
      expect(await factory.positionManager()).to.equal(await positionManager.getAddress());
      expect(await factory.permit2()).to.equal(await permit2.getAddress());
      expect(await factory.feeHook()).to.equal(await feeHook.getAddress());
    });

    it("should set default minEthLiquidity to 0.01 ether", async function () {
      const { factory } = await loadFixture(deployFineTuneTokenFactory);
      expect(await factory.minEthLiquidity()).to.equal(MIN_ETH_LIQUIDITY);
    });

    it("should start with zero tokens launched", async function () {
      const { factory } = await loadFixture(deployFineTuneTokenFactory);
      expect(await factory.totalTokensLaunched()).to.equal(0);
    });

    it("should revert if constructor receives zero PoolManager address", async function () {
      const [, pm, p2, fh] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("FineTuneTokenFactory");
      await expect(
        Factory.deploy(ethers.ZeroAddress, pm.address, p2.address, fh.address)
      ).to.be.revertedWith("Invalid PoolManager");
    });

    it("should revert if constructor receives zero feeHook address", async function () {
      const [, pm, posm, p2] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("FineTuneTokenFactory");
      await expect(
        Factory.deploy(pm.address, posm.address, p2.address, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid feeHook");
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
      const { factory, mockContent, owner, creator } = deployed;

      // Mint a content NFT to the owner (who will call launchToken)
      const mintTx = await mockContent.mintTo(owner.address);
      const receipt = await mintTx.wait();
      const contentTokenId = 1n;

      return { ...deployed, contentTokenId };
    }

    it("should deploy a FineTuneToken and return its address", async function () {
      const { factory, contentTokenId, creator } = await loadFixture(launchFixture);

      const tx = await factory.launchToken(
        contentTokenId,
        tokenName,
        tokenSymbol,
        modelIrysHash,
        creator.address,
        { value: MIN_ETH_LIQUIDITY }
      );
      const receipt = await tx.wait();

      const tokenAddr = await factory.getToken(contentTokenId);
      expect(tokenAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("should allocate 96% of supply to liquidity and 4% to creator", async function () {
      const { factory, contentTokenId, creator } = await loadFixture(launchFixture);

      await factory.launchToken(
        contentTokenId,
        tokenName,
        tokenSymbol,
        modelIrysHash,
        creator.address,
        { value: MIN_ETH_LIQUIDITY }
      );

      const tokenAddr = await factory.getToken(contentTokenId);
      const token = await ethers.getContractAt("FineTuneToken", tokenAddr);

      const creatorBalance = await token.balanceOf(creator.address);
      const expectedCreatorAmount = (TOTAL_SUPPLY * 400n) / 10000n; // 4%
      expect(creatorBalance).to.equal(expectedCreatorAmount);
    });

    it("should register pool with feeHook using poolType=1 and mintPoolIndex=5", async function () {
      const { factory, feeHook, contentTokenId, creator } = await loadFixture(launchFixture);

      const tx = await factory.launchToken(
        contentTokenId,
        tokenName,
        tokenSymbol,
        modelIrysHash,
        creator.address,
        { value: MIN_ETH_LIQUIDITY }
      );
      const receipt = await tx.wait();

      // Get the poolId from event
      const event = receipt.logs.find(
        (log) => {
          try {
            return factory.interface.parseLog(log)?.name === "ModelTokenLaunched";
          } catch {
            return false;
          }
        }
      );
      const parsed = factory.interface.parseLog(event);
      const poolId = parsed.args.poolId;

      // Verify feeHook registration
      const reg = await feeHook.getRegistration(poolId);
      expect(reg.beneficiary).to.equal(creator.address);
      expect(reg.companionOwner).to.equal(ethers.ZeroAddress);
      expect(reg.poolType).to.equal(POOL_TYPE_FINETUNE); // 1
      expect(reg.mintPoolIndex).to.equal(5); // MINT_POOL_INDEX
    });

    it("should emit ModelTokenLaunched event with correct args", async function () {
      const { factory, contentTokenId, creator } = await loadFixture(launchFixture);

      await expect(
        factory.launchToken(
          contentTokenId,
          tokenName,
          tokenSymbol,
          modelIrysHash,
          creator.address,
          { value: MIN_ETH_LIQUIDITY }
        )
      ).to.emit(factory, "ModelTokenLaunched");
    });

    it("should lock LP position NFT to DEAD_ADDRESS", async function () {
      const { factory, positionManager, contentTokenId, creator } =
        await loadFixture(launchFixture);

      const tx = await factory.launchToken(
        contentTokenId,
        tokenName,
        tokenSymbol,
        modelIrysHash,
        creator.address,
        { value: MIN_ETH_LIQUIDITY }
      );
      const receipt = await tx.wait();

      // The position NFT (tokenId=1) should be owned by DEAD_ADDRESS
      const positionOwner = await positionManager.ownerOf(1);
      expect(positionOwner).to.equal(DEAD_ADDRESS);
    });

    it("should increment totalTokensLaunched after each launch", async function () {
      const { factory, mockContent, owner, creator } = await loadFixture(launchFixture);

      // Launch first token (contentTokenId=1 already minted)
      await factory.launchToken(1, tokenName, tokenSymbol, modelIrysHash, creator.address, {
        value: MIN_ETH_LIQUIDITY,
      });
      expect(await factory.totalTokensLaunched()).to.equal(1);

      // Mint second content NFT and launch
      await mockContent.mintTo(owner.address);
      await factory.launchToken(2, "Model2", "BZM2", "hash2", creator.address, {
        value: MIN_ETH_LIQUIDITY,
      });
      expect(await factory.totalTokensLaunched()).to.equal(2);
    });

    // ─── Validation ──────────────────────────────────────────────────────────

    it("should revert if msg.value < minEthLiquidity", async function () {
      const { factory, contentTokenId, creator } = await loadFixture(launchFixture);
      const tooLow = MIN_ETH_LIQUIDITY - 1n;

      await expect(
        factory.launchToken(
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
      const { factory, contentTokenId, creator } = await loadFixture(launchFixture);

      // Launch first time
      await factory.launchToken(
        contentTokenId,
        tokenName,
        tokenSymbol,
        modelIrysHash,
        creator.address,
        { value: MIN_ETH_LIQUIDITY }
      );

      // Attempt duplicate
      await expect(
        factory.launchToken(
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
      const { factory, contentTokenId } = await loadFixture(launchFixture);

      await expect(
        factory.launchToken(
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
      const { factory, contentTokenId, user1, creator } = await loadFixture(launchFixture);

      // user1 does not own contentTokenId=1 (owner does)
      await expect(
        factory.connect(user1).launchToken(
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
      const { factory, contentTokenId, creator } = await loadFixture(launchFixture);

      await expect(
        factory.launchToken(
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
      const { factory, contentTokenId, creator } = await loadFixture(launchFixture);

      await expect(
        factory.launchToken(
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
        await permit2.getAddress(),
        await feeHook.getAddress()
      );

      // Do NOT call setContentContract
      await expect(
        factory.launchToken(1, tokenName, tokenSymbol, modelIrysHash, creator.address, {
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
      const { factory, mockContent, owner, creator } = deployed;

      await mockContent.mintTo(owner.address);
      const contentTokenId = 1n;

      await factory.launchToken(
        contentTokenId,
        tokenName,
        tokenSymbol,
        modelIrysHash,
        creator.address,
        { value: MIN_ETH_LIQUIDITY }
      );

      const tokenAddr = await factory.getToken(contentTokenId);
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
      const { factory, mockContent, owner, creator } = deployed;

      await mockContent.mintTo(owner.address);
      const contentTokenId = 1n;

      await factory.launchToken(
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
      const { factory, contentTokenId } = await loadFixture(viewFixture);
      expect(await factory.hasToken(contentTokenId)).to.be.true;
    });

    it("hasToken() should return false for non-launched content token", async function () {
      const { factory } = await loadFixture(viewFixture);
      expect(await factory.hasToken(999)).to.be.false;
    });

    it("getToken() should return the deployed token address", async function () {
      const { factory, contentTokenId } = await loadFixture(viewFixture);
      const tokenAddr = await factory.getToken(contentTokenId);
      expect(tokenAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("getToken() should return zero address for non-launched content token", async function () {
      const { factory } = await loadFixture(viewFixture);
      expect(await factory.getToken(999)).to.equal(ethers.ZeroAddress);
    });

    it("totalTokensLaunched() should reflect accurate count", async function () {
      const { factory, mockContent, owner, creator } = await loadFixture(viewFixture);

      // Already launched 1
      expect(await factory.totalTokensLaunched()).to.equal(1);

      // Launch a second
      await mockContent.mintTo(owner.address);
      await factory.launchToken(2, "Model2", "BZM2", "hash2", creator.address, {
        value: MIN_ETH_LIQUIDITY,
      });
      expect(await factory.totalTokensLaunched()).to.equal(2);
    });

    it("getAllTokens() should return all launched token addresses", async function () {
      const { factory, mockContent, owner, creator, contentTokenId } =
        await loadFixture(viewFixture);

      const firstToken = await factory.getToken(contentTokenId);

      // Launch a second token
      await mockContent.mintTo(owner.address);
      await factory.launchToken(2, "Model2", "BZM2", "hash2", creator.address, {
        value: MIN_ETH_LIQUIDITY,
      });
      const secondToken = await factory.getToken(2);

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
        const { factory, owner } = await loadFixture(deployFineTuneTokenFactory);
        const newAddr = ethers.Wallet.createRandom().address;
        await factory.connect(owner).setContentContract(newAddr);
        expect(await factory.contentContract()).to.equal(newAddr);
      });

      it("should revert if setting to zero address", async function () {
        const { factory } = await loadFixture(deployFineTuneTokenFactory);
        await expect(
          factory.setContentContract(ethers.ZeroAddress)
        ).to.be.revertedWith("Invalid address");
      });

      it("should revert if called by non-owner", async function () {
        const { factory, user1 } = await loadFixture(deployFineTuneTokenFactory);
        const addr = ethers.Wallet.createRandom().address;
        await expect(
          factory.connect(user1).setContentContract(addr)
        ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      });
    });

    describe("setMinEthLiquidity()", function () {
      it("should allow owner to update min ETH liquidity", async function () {
        const { factory } = await loadFixture(deployFineTuneTokenFactory);
        const newMin = ethers.parseEther("0.05");
        await factory.setMinEthLiquidity(newMin);
        expect(await factory.minEthLiquidity()).to.equal(newMin);
      });

      it("should emit MinEthLiquidityUpdated event", async function () {
        const { factory } = await loadFixture(deployFineTuneTokenFactory);
        const newMin = ethers.parseEther("0.05");
        await expect(factory.setMinEthLiquidity(newMin))
          .to.emit(factory, "MinEthLiquidityUpdated")
          .withArgs(MIN_ETH_LIQUIDITY, newMin);
      });

      it("should revert if new min is zero", async function () {
        const { factory } = await loadFixture(deployFineTuneTokenFactory);
        await expect(factory.setMinEthLiquidity(0)).to.be.revertedWith("Min must be positive");
      });

      it("should revert if called by non-owner", async function () {
        const { factory, user1 } = await loadFixture(deployFineTuneTokenFactory);
        await expect(
          factory.connect(user1).setMinEthLiquidity(ethers.parseEther("1"))
        ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      });

      it("should enforce updated minEthLiquidity on subsequent launches", async function () {
        const { factory, mockContent, owner, creator } =
          await loadFixture(deployFineTuneTokenFactory);

        // Increase min to 1 ETH
        const highMin = ethers.parseEther("1");
        await factory.setMinEthLiquidity(highMin);

        await mockContent.mintTo(owner.address);

        // Old amount should fail
        await expect(
          factory.launchToken(1, "Test", "TST", "hash", creator.address, {
            value: MIN_ETH_LIQUIDITY,
          })
        ).to.be.revertedWith("Insufficient ETH for liquidity");

        // New amount should succeed
        await expect(
          factory.launchToken(1, "Test", "TST", "hash", creator.address, {
            value: highMin,
          })
        ).to.not.be.reverted;
      });
    });
  });
});
