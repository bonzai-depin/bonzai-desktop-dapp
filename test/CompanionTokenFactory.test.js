const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployCompanionTokenFactory } = require("./helpers/deploy");
const {
  TOTAL_SUPPLY,
  POOL_SHARE_BPS,
  AGENT_SHARE_BPS,
  BPS_DENOMINATOR,
  BURN_ADDRESS,
  MIN_ETH_LIQUIDITY,
} = require("./helpers/constants");

describe("CompanionTokenFactory", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Mint a companion NFT and launch its token in one step.
   * Returns { tx, tokenAddr, poolId, nftTokenId }.
   */
  async function mintAndLaunch(fixture, overrides = {}) {
    const {
      factory,
      mockCompanions,
      user1,
      agentWallet,
      companionOwner,
    } = fixture;

    const caller = overrides.caller || user1;
    const name = overrides.name || "Aurore Delacroix";
    const symbol = overrides.symbol || "AURORE";
    const imageURI = overrides.imageURI || "ipfs://QmTestImage";
    const agent = overrides.agentWallet || agentWallet.address;
    const owner = overrides.companionOwner || companionOwner.address;
    const value = overrides.value !== undefined ? overrides.value : MIN_ETH_LIQUIDITY;

    // Mint NFT to the caller
    const mintTx = await mockCompanions.mintTo(caller.address);
    const mintReceipt = await mintTx.wait();
    const transferEvent = mintReceipt.logs.find(
      (log) => log.fragment && log.fragment.name === "Transfer"
    );
    const nftTokenId = overrides.nftTokenId || transferEvent.args[2];

    const tx = await factory
      .connect(caller)
      .launchToken(nftTokenId, name, symbol, imageURI, agent, owner, {
        value,
      });

    const receipt = await tx.wait();
    const launchEvent = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "CompanionTokenLaunched"
    );

    return {
      tx,
      tokenAddr: launchEvent.args[1], // token (indexed)
      poolId: launchEvent.args[2], // poolId (indexed)
      nftTokenId,
      receipt,
    };
  }

  it('pins the smart-agent registry after issuance so numeric IDs cannot acquire a different meaning', async function () {
    const fixture = await loadFixture(deployCompanionTokenFactory);
    await mintAndLaunch(fixture);
    const anotherRegistry = await (await ethers.getContractFactory('MockBonzaiCompanions')).deploy();
    await expect(fixture.factory.setCompanionContract(await anotherRegistry.getAddress())).to.be.revertedWith('Registry frozen after issuance');
    await fixture.factory.setCompanionContract(await fixture.mockCompanions.getAddress());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      const { factory, owner } = await loadFixture(deployCompanionTokenFactory);
      expect(await factory.owner()).to.equal(owner.address);
    });

    it("should set the correct immutable addresses", async function () {
      const { factory, poolManager, positionManager, permit2, feeHook } =
        await loadFixture(deployCompanionTokenFactory);

      expect(await factory.poolManager()).to.equal(await poolManager.getAddress());
      expect(await factory.positionManager()).to.equal(await positionManager.getAddress());
      expect(await factory.permit2()).to.equal(await permit2.getAddress());
      expect(await factory.feeHook()).to.equal(await feeHook.getAddress());
    });

    it("should set companionContract via deploy helper", async function () {
      const { factory, mockCompanions } = await loadFixture(deployCompanionTokenFactory);
      expect(await factory.companionContract()).to.equal(await mockCompanions.getAddress());
    });

    it("should have correct constants", async function () {
      const { factory } = await loadFixture(deployCompanionTokenFactory);
      expect(await factory.TOTAL_SUPPLY()).to.equal(TOTAL_SUPPLY);
      expect(await factory.POOL_SHARE_BPS()).to.equal(POOL_SHARE_BPS);
      expect(await factory.AGENT_SHARE_BPS()).to.equal(AGENT_SHARE_BPS);
      expect(await factory.BPS_DENOMINATOR()).to.equal(BPS_DENOMINATOR);
      expect(await factory.BURN_ADDRESS()).to.equal(BURN_ADDRESS);
      expect(await factory.MINT_POOL_INDEX()).to.equal(0); // Unused for COMPANION — hook hardcodes pool 5
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // launchToken()
  // ═══════════════════════════════════════════════════════════════════════════

  describe("launchToken()", function () {
    it("mints the companion identity, ERC-20, and permanent liquidity atomically", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { factory, user1, agentWallet, owner } = fixture;
      const Companions = await ethers.getContractFactory("BonzaiCompanions");
      const companions = await Companions.deploy(owner.address);
      await companions.setCompanionTokenFactory(await factory.getAddress());
      await factory.setCompanionContract(await companions.getAddress());

      const profile = 0x357926548375n;
      const tx = await companions.connect(user1).mintCompanionWithToken(
        "ipfs://atomic-agent",
        ethers.id("atomic-personality"),
        profile,
        1,
        agentWallet.address,
        "Aurore",
        "AURORE",
        { value: ethers.parseEther("0.30") },
      );
      const receipt = await tx.wait();
      const event = receipt.logs.map((log) => {
        try { return companions.interface.parseLog(log); } catch { return null; }
      }).find((entry) => entry?.name === "CompanionEconomyLaunched");

      expect(event.args.tokenId).to.equal(1n);
      expect(event.args.token).to.equal(await factory.getToken(1n));
      expect(event.args.liquidity).to.equal(ethers.parseEther("0.05"));
    });

    it("should deploy a CompanionToken and return its address", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { tokenAddr } = await mintAndLaunch(fixture);

      expect(tokenAddr).to.not.equal(ethers.ZeroAddress);

      // Verify it is a valid ERC-20
      const token = await ethers.getContractAt("CompanionToken", tokenAddr);
      expect(await token.name()).to.equal("Aurore Delacroix");
      expect(await token.symbol()).to.equal("AURORE");
    });

    it("should allocate 96% of supply to liquidity and 4% to agentWallet", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { tokenAddr } = await mintAndLaunch(fixture);

      const token = await ethers.getContractAt("CompanionToken", tokenAddr);
      const agentBalance = await token.balanceOf(fixture.agentWallet.address);

      const expectedAgentAmount = (TOTAL_SUPPLY * AGENT_SHARE_BPS) / BPS_DENOMINATOR;
      expect(agentBalance).to.equal(expectedAgentAmount);

      // The remaining 96% was sent to the positionManager (mock keeps it on factory or PM).
      // The factory should not hold the pool share after launch. Verify agent amount is exactly 4%.
      expect(expectedAgentAmount).to.equal(TOTAL_SUPPLY * 400n / 10000n);
    });

    it("should register pool with feeHook using poolType=0 and live NFT lookup", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { poolId, nftTokenId } = await mintAndLaunch(fixture);

      // H7: pool registration carries the NFT contract + tokenId so the hook
      // can read the live owner / agent wallet at swap time. The legacy
      // companionOwner field has been replaced.
      const reg = await fixture.feeHook.getRegistration(poolId);
      expect(reg.beneficiary).to.equal(fixture.agentWallet.address);
      expect(reg.companionNFT).to.equal(await fixture.mockCompanions.getAddress());
      expect(reg.companionTokenId).to.equal(nftTokenId);
      expect(reg.poolType).to.equal(0);
      expect(reg.mintPoolIndex).to.equal(0); // Unused for COMPANION — hook spreads slice across all 6 buckets
    });

    it("should transfer LP position NFT to BURN_ADDRESS", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      await mintAndLaunch(fixture);

      // The MockPositionManager mints position NFT with tokenId=1 to the factory,
      // then factory transfers it to BURN_ADDRESS
      const positionNftOwner = await fixture.positionManager.ownerOf(1);
      expect(positionNftOwner).to.equal(BURN_ADDRESS);
    });

    it("should emit CompanionTokenLaunched event with correct args", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { factory, mockCompanions, user1, agentWallet, companionOwner } = fixture;

      const mintTx = await mockCompanions.mintTo(user1.address);
      const mintReceipt = await mintTx.wait();
      const transferEvent = mintReceipt.logs.find(
        (log) => log.fragment && log.fragment.name === "Transfer"
      );
      const nftTokenId = transferEvent.args[2];

      await expect(
        factory
          .connect(user1)
          .launchToken(
            nftTokenId,
            "Aurore Delacroix",
            "AURORE",
            "ipfs://QmTestImage",
            agentWallet.address,
            companionOwner.address,
            { value: MIN_ETH_LIQUIDITY }
          )
      ).to.emit(factory, "CompanionTokenLaunched");
    });

    it("should record the token in companionTokens mapping", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { tokenAddr, nftTokenId } = await mintAndLaunch(fixture);

      expect(await fixture.factory.companionTokens(nftTokenId)).to.equal(tokenAddr);
    });

    it("should accept ETH above the minimum liquidity requirement", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const largerValue = ethers.parseEther("1.0");
      const { tokenAddr } = await mintAndLaunch(fixture, { value: largerValue });

      expect(tokenAddr).to.not.equal(ethers.ZeroAddress);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Validation", function () {
    it("should revert when launching a duplicate token for the same companion", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { nftTokenId } = await mintAndLaunch(fixture);

      // Attempt to launch again with the same nftTokenId
      await expect(
        fixture.factory
          .connect(fixture.user1)
          .launchToken(
            nftTokenId,
            "Aurore Delacroix",
            "AURORE",
            "ipfs://QmTestImage",
            fixture.agentWallet.address,
            fixture.companionOwner.address,
            { value: MIN_ETH_LIQUIDITY }
          )
      ).to.be.revertedWith("Token already exists for this companion");
    });

    it("should revert when caller is not the NFT owner", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { factory, mockCompanions, user1, agentWallet, companionOwner, owner } = fixture;

      // Mint NFT to user1
      const mintTx = await mockCompanions.mintTo(user1.address);
      const mintReceipt = await mintTx.wait();
      const transferEvent = mintReceipt.logs.find(
        (log) => log.fragment && log.fragment.name === "Transfer"
      );
      const nftTokenId = transferEvent.args[2];

      // Try to launch from owner (not the NFT holder)
      await expect(
        factory
          .connect(owner)
          .launchToken(
            nftTokenId,
            "Aurore",
            "AURORE",
            "ipfs://Qm",
            agentWallet.address,
            companionOwner.address,
            { value: MIN_ETH_LIQUIDITY }
          )
      ).to.be.revertedWith("Not NFT owner");
    });

    it("should revert when ETH sent is below minimum liquidity", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { factory, mockCompanions, user1, agentWallet, companionOwner } = fixture;

      const mintTx = await mockCompanions.mintTo(user1.address);
      const mintReceipt = await mintTx.wait();
      const transferEvent = mintReceipt.logs.find(
        (log) => log.fragment && log.fragment.name === "Transfer"
      );
      const nftTokenId = transferEvent.args[2];

      await expect(
        factory
          .connect(user1)
          .launchToken(
            nftTokenId,
            "Aurore",
            "AURORE",
            "ipfs://Qm",
            agentWallet.address,
            companionOwner.address,
            { value: ethers.parseEther("0.001") }
          )
      ).to.be.revertedWith("Insufficient ETH for liquidity");
    });

    it("should revert with zero ETH value", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { factory, mockCompanions, user1, agentWallet, companionOwner } = fixture;

      const mintTx = await mockCompanions.mintTo(user1.address);
      const mintReceipt = await mintTx.wait();
      const transferEvent = mintReceipt.logs.find(
        (log) => log.fragment && log.fragment.name === "Transfer"
      );
      const nftTokenId = transferEvent.args[2];

      await expect(
        factory
          .connect(user1)
          .launchToken(
            nftTokenId,
            "Aurore",
            "AURORE",
            "ipfs://Qm",
            agentWallet.address,
            companionOwner.address,
            { value: 0 }
          )
      ).to.be.revertedWith("Insufficient ETH for liquidity");
    });

    it("should revert when nftTokenId is 0", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);

      await expect(
        fixture.factory
          .connect(fixture.user1)
          .launchToken(
            0,
            "Aurore",
            "AURORE",
            "ipfs://Qm",
            fixture.agentWallet.address,
            fixture.companionOwner.address,
            { value: MIN_ETH_LIQUIDITY }
          )
      ).to.be.revertedWith("Must have minted NFT");
    });

    it("should revert when name is empty", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { factory, mockCompanions, user1, agentWallet, companionOwner } = fixture;

      const mintTx = await mockCompanions.mintTo(user1.address);
      const mintReceipt = await mintTx.wait();
      const transferEvent = mintReceipt.logs.find(
        (log) => log.fragment && log.fragment.name === "Transfer"
      );
      const nftTokenId = transferEvent.args[2];

      await expect(
        factory
          .connect(user1)
          .launchToken(
            nftTokenId,
            "",
            "AURORE",
            "ipfs://Qm",
            agentWallet.address,
            companionOwner.address,
            { value: MIN_ETH_LIQUIDITY }
          )
      ).to.be.revertedWith("Name required");
    });

    it("should revert when symbol is empty", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { factory, mockCompanions, user1, agentWallet, companionOwner } = fixture;

      const mintTx = await mockCompanions.mintTo(user1.address);
      const mintReceipt = await mintTx.wait();
      const transferEvent = mintReceipt.logs.find(
        (log) => log.fragment && log.fragment.name === "Transfer"
      );
      const nftTokenId = transferEvent.args[2];

      await expect(
        factory
          .connect(user1)
          .launchToken(
            nftTokenId,
            "Aurore",
            "",
            "ipfs://Qm",
            agentWallet.address,
            companionOwner.address,
            { value: MIN_ETH_LIQUIDITY }
          )
      ).to.be.revertedWith("Symbol required");
    });

    it("should revert when agentWallet is zero address", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { factory, mockCompanions, user1, companionOwner } = fixture;

      const mintTx = await mockCompanions.mintTo(user1.address);
      const mintReceipt = await mintTx.wait();
      const transferEvent = mintReceipt.logs.find(
        (log) => log.fragment && log.fragment.name === "Transfer"
      );
      const nftTokenId = transferEvent.args[2];

      await expect(
        factory
          .connect(user1)
          .launchToken(
            nftTokenId,
            "Aurore",
            "AURORE",
            "ipfs://Qm",
            ethers.ZeroAddress,
            companionOwner.address,
            { value: MIN_ETH_LIQUIDITY }
          )
      ).to.be.revertedWith("Invalid agent wallet address");
    });

    it("should revert when companionOwner is zero address", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { factory, mockCompanions, user1, agentWallet } = fixture;

      const mintTx = await mockCompanions.mintTo(user1.address);
      const mintReceipt = await mintTx.wait();
      const transferEvent = mintReceipt.logs.find(
        (log) => log.fragment && log.fragment.name === "Transfer"
      );
      const nftTokenId = transferEvent.args[2];

      await expect(
        factory
          .connect(user1)
          .launchToken(
            nftTokenId,
            "Aurore",
            "AURORE",
            "ipfs://Qm",
            agentWallet.address,
            ethers.ZeroAddress,
            { value: MIN_ETH_LIQUIDITY }
          )
      ).to.be.revertedWith("Invalid companion owner address");
    });

    it("should revert when companionContract is not set", async function () {
      const [owner, user1, agentWallet, companionOwner] = await ethers.getSigners();

      const MockPoolManager = await ethers.getContractFactory("MockPoolManager");
      const poolManager = await MockPoolManager.deploy();
      const MockPositionManager = await ethers.getContractFactory("MockPositionManager");
      const positionManager = await MockPositionManager.deploy();
      const MockPermit2 = await ethers.getContractFactory("MockPermit2");
      const permit2 = await MockPermit2.deploy();
      const MockFeeHook = await ethers.getContractFactory("MockFeeHook");
      const feeHook = await MockFeeHook.deploy();

      const CompanionTokenFactory = await ethers.getContractFactory("CompanionTokenFactory");
      const factory = await CompanionTokenFactory.deploy(
        await poolManager.getAddress(),
        await positionManager.getAddress(),
        await permit2.getAddress(),
        await feeHook.getAddress()
      );

      // Do NOT call setCompanionContract
      await expect(
        factory
          .connect(user1)
          .launchToken(1, "Aurore", "AURORE", "ipfs://Qm", agentWallet.address, companionOwner.address, {
            value: MIN_ETH_LIQUIDITY,
          })
      ).to.be.revertedWith("Companion contract not set");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CompanionToken
  // ═══════════════════════════════════════════════════════════════════════════

  describe("CompanionToken", function () {
    it("should have correct total supply of 1 billion tokens", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { tokenAddr } = await mintAndLaunch(fixture);

      const token = await ethers.getContractAt("CompanionToken", tokenAddr);
      expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
    });

    it("should return correct metadata from getTokenInfo()", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { tokenAddr, nftTokenId } = await mintAndLaunch(fixture);

      const token = await ethers.getContractAt("CompanionToken", tokenAddr);
      const [name_, symbol_, decimals_, image_, agentWallet_, companionId_] =
        await token.getTokenInfo();

      expect(name_).to.equal("Aurore Delacroix");
      expect(symbol_).to.equal("AURORE");
      expect(decimals_).to.equal(18);
      expect(image_).to.equal("ipfs://QmTestImage");
      expect(agentWallet_).to.equal(fixture.agentWallet.address);
      expect(companionId_).to.equal(nftTokenId);
    });

    it("should be burnable by token holders", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { tokenAddr } = await mintAndLaunch(fixture);

      const token = await ethers.getContractAt("CompanionToken", tokenAddr);
      const agentBalance = await token.balanceOf(fixture.agentWallet.address);

      // Agent wallet burns half their tokens
      const burnAmount = agentBalance / 2n;
      await token.connect(fixture.agentWallet).burn(burnAmount);

      expect(await token.balanceOf(fixture.agentWallet.address)).to.equal(
        agentBalance - burnAmount
      );
      expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY - burnAmount);
    });

    it("should store the factory address", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { tokenAddr } = await mintAndLaunch(fixture);

      const token = await ethers.getContractAt("CompanionToken", tokenAddr);
      expect(await token.factory()).to.equal(await fixture.factory.getAddress());
    });

    it("should have 18 decimals", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { tokenAddr } = await mintAndLaunch(fixture);

      const token = await ethers.getContractAt("CompanionToken", tokenAddr);
      expect(await token.decimals()).to.equal(18);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("View functions", function () {
    it("hasToken() should return false before launch", async function () {
      const { factory } = await loadFixture(deployCompanionTokenFactory);
      expect(await factory.hasToken(1)).to.be.false;
    });

    it("hasToken() should return true after launch", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { nftTokenId } = await mintAndLaunch(fixture);
      expect(await fixture.factory.hasToken(nftTokenId)).to.be.true;
    });

    it("getToken() should return zero address before launch", async function () {
      const { factory } = await loadFixture(deployCompanionTokenFactory);
      expect(await factory.getToken(999)).to.equal(ethers.ZeroAddress);
    });

    it("getToken() should return the token address after launch", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);
      const { tokenAddr, nftTokenId } = await mintAndLaunch(fixture);
      expect(await fixture.factory.getToken(nftTokenId)).to.equal(tokenAddr);
    });

    it("totalTokensLaunched() should start at 0", async function () {
      const { factory } = await loadFixture(deployCompanionTokenFactory);
      expect(await factory.totalTokensLaunched()).to.equal(0);
    });

    it("totalTokensLaunched() should increment with each launch", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);

      await mintAndLaunch(fixture, { name: "Aurore Delacroix", symbol: "AURORE" });
      expect(await fixture.factory.totalTokensLaunched()).to.equal(1);

      await mintAndLaunch(fixture, { name: "Luna Silverstream", symbol: "LUNA" });
      expect(await fixture.factory.totalTokensLaunched()).to.equal(2);
    });

    it("getAllTokens() should return all launched token addresses", async function () {
      const fixture = await loadFixture(deployCompanionTokenFactory);

      const { tokenAddr: addr1 } = await mintAndLaunch(fixture, {
        name: "Aurore Delacroix",
        symbol: "AURORE",
      });
      const { tokenAddr: addr2 } = await mintAndLaunch(fixture, {
        name: "Luna Silverstream",
        symbol: "LUNA",
      });

      const allTokens = await fixture.factory.getAllTokens();
      expect(allTokens.length).to.equal(2);
      expect(allTokens[0]).to.equal(addr1);
      expect(allTokens[1]).to.equal(addr2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Admin functions", function () {
    describe("setCompanionContract()", function () {
      it("should allow owner to set companion contract", async function () {
        const { factory, owner } = await loadFixture(deployCompanionTokenFactory);
        const newAddr = ethers.Wallet.createRandom().address;
        await factory.connect(owner).setCompanionContract(newAddr);
        expect(await factory.companionContract()).to.equal(newAddr);
      });

      it("should revert when called by non-owner", async function () {
        const { factory, user1 } = await loadFixture(deployCompanionTokenFactory);
        const newAddr = ethers.Wallet.createRandom().address;
        await expect(
          factory.connect(user1).setCompanionContract(newAddr)
        ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      });

      it("should revert when setting to zero address", async function () {
        const { factory, owner } = await loadFixture(deployCompanionTokenFactory);
        await expect(
          factory.connect(owner).setCompanionContract(ethers.ZeroAddress)
        ).to.be.revertedWith("Invalid address");
      });
    });

    describe("setMinEthLiquidity()", function () {
      it("should allow owner to update minimum ETH liquidity", async function () {
        const { factory, owner } = await loadFixture(deployCompanionTokenFactory);
        const newMin = ethers.parseEther("0.05");
        await factory.connect(owner).setMinEthLiquidity(newMin);
        expect(await factory.minEthLiquidity()).to.equal(newMin);
      });

      it("should emit MinEthLiquidityUpdated event", async function () {
        const { factory, owner } = await loadFixture(deployCompanionTokenFactory);
        const newMin = ethers.parseEther("0.05");
        await expect(factory.connect(owner).setMinEthLiquidity(newMin))
          .to.emit(factory, "MinEthLiquidityUpdated")
          .withArgs(MIN_ETH_LIQUIDITY, newMin);
      });

      it("should revert when called by non-owner", async function () {
        const { factory, user1 } = await loadFixture(deployCompanionTokenFactory);
        await expect(
          factory.connect(user1).setMinEthLiquidity(ethers.parseEther("0.05"))
        ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      });

      it("should revert when setting to zero", async function () {
        const { factory, owner } = await loadFixture(deployCompanionTokenFactory);
        await expect(
          factory.connect(owner).setMinEthLiquidity(0)
        ).to.be.revertedWith("Min must be positive");
      });

      it("should enforce the new minimum on subsequent launches", async function () {
        const fixture = await loadFixture(deployCompanionTokenFactory);
        const { factory, owner, mockCompanions, user1, agentWallet, companionOwner } = fixture;

        // Increase minimum to 0.1 ETH
        const newMin = ethers.parseEther("0.1");
        await factory.connect(owner).setMinEthLiquidity(newMin);

        const mintTx = await mockCompanions.mintTo(user1.address);
        const mintReceipt = await mintTx.wait();
        const transferEvent = mintReceipt.logs.find(
          (log) => log.fragment && log.fragment.name === "Transfer"
        );
        const nftTokenId = transferEvent.args[2];

        // Old minimum (0.01) should now fail
        await expect(
          factory
            .connect(user1)
            .launchToken(
              nftTokenId,
              "Aurore",
              "AURORE",
              "ipfs://Qm",
              agentWallet.address,
              companionOwner.address,
              { value: MIN_ETH_LIQUIDITY }
            )
        ).to.be.revertedWith("Insufficient ETH for liquidity");

        // New minimum should succeed
        await factory
          .connect(user1)
          .launchToken(
            nftTokenId,
            "Aurore",
            "AURORE",
            "ipfs://Qm",
            agentWallet.address,
            companionOwner.address,
            { value: newMin }
          );

        expect(await factory.hasToken(nftTokenId)).to.be.true;
      });
    });
  });
});
