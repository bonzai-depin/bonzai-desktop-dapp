const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployHook } = require("./helpers/deploy");
const {
  HOOK_FEE_BPS,
  BPS_DENOMINATOR,
  COMPANION_WALLET_BPS,
  COMPANION_OWNER_BPS,
  COMPANION_TREASURY_BPS,
  COMPANION_POOL_BPS,
  FINETUNE_BENEFICIARY_BPS,
  FINETUNE_TREASURY_BPS,
  FINETUNE_POOL_BPS,
  POOL_TYPE_COMPANION,
  POOL_TYPE_FINETUNE,
  NUM_POOLS,
} = require("./helpers/constants");

/**
 * Build a PoolKey struct for use in afterSwap tests.
 * currency0 = address(0) (ETH), currency1 = arbitrary token address.
 */
function makePoolKey(hookAddress, tokenAddress) {
  return {
    currency0: ethers.ZeroAddress,
    currency1: tokenAddress || "0x0000000000000000000000000000000000000001",
    fee: 0,
    tickSpacing: 60,
    hooks: hookAddress,
  };
}

/**
 * Default SwapParams.
 * zeroForOne = false means user sells token1 (ERC-20) and receives token0 (ETH).
 */
function makeSwapParams(zeroForOne = false) {
  return {
    zeroForOne,
    amountSpecified: 0,
    sqrtPriceLimitX96: 0,
  };
}

/**
 * Compute poolId hash from a PoolKey, matching the contract's keccak256(abi.encode(key)).
 */
function computePoolId(key) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint24", "int24", "address"],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]
    )
  );
}

/**
 * Helper that calls registerPool with the new 6-arg signature.
 * For COMPANION pools, passes the mocked companions NFT contract + tokenId 1.
 * For FINETUNE pools, passes zero NFT (FineTune doesn't use live lookups).
 */
async function regPool(hook, signer, poolId, beneficiary, poolType, mintPoolIdx, mockCompanionsAddr) {
  const isCompanion = poolType === POOL_TYPE_COMPANION;
  const nftAddr = isCompanion ? mockCompanionsAddr : ethers.ZeroAddress;
  const tokenId = isCompanion ? 1n : 0n;
  return hook.connect(signer).registerPool(poolId, beneficiary, nftAddr, tokenId, poolType, mintPoolIdx);
}

/**
 * Sum unclaimed across all 6 MintPool buckets (since the pool slice is spread).
 */
async function sumPoolBuckets(hook) {
  let total = 0n;
  for (let i = 0; i < NUM_POOLS; i++) total += await hook.unclaimedPool(i);
  return total;
}

describe("BonzaiUniswapHook", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      const { hook, owner } = await loadFixture(deployHook);
      expect(await hook.owner()).to.equal(owner.address);
    });

    it("should set the correct poolManager", async function () {
      const { hook, poolManager } = await loadFixture(deployHook);
      expect(await hook.poolManager()).to.equal(await poolManager.getAddress());
    });

    it("should set the correct treasury", async function () {
      const { hook, treasury } = await loadFixture(deployHook);
      expect(await hook.treasury()).to.equal(treasury.address);
    });

    it("should set the correct mintPool", async function () {
      const { hook, mockPool } = await loadFixture(deployHook);
      expect(await hook.mintPool()).to.equal(await mockPool.getAddress());
    });

    it("should revert when poolManager is zero address", async function () {
      const [owner, treasury] = await ethers.getSigners();
      const MockMintPool = await ethers.getContractFactory("MockMintPool");
      const pool = await MockMintPool.deploy();
      const BonzaiUniswapHook = await ethers.getContractFactory("BonzaiUniswapHook");
      await expect(
        BonzaiUniswapHook.deploy(ethers.ZeroAddress, treasury.address, await pool.getAddress(), owner.address)
      ).to.be.revertedWith("Invalid PoolManager");
    });

    it("should revert when treasury is zero address", async function () {
      const [owner] = await ethers.getSigners();
      const MockPoolManager = await ethers.getContractFactory("MockPoolManager");
      const pm = await MockPoolManager.deploy();
      const MockMintPool = await ethers.getContractFactory("MockMintPool");
      const pool = await MockMintPool.deploy();
      const BonzaiUniswapHook = await ethers.getContractFactory("BonzaiUniswapHook");
      await expect(
        BonzaiUniswapHook.deploy(await pm.getAddress(), ethers.ZeroAddress, await pool.getAddress(), owner.address)
      ).to.be.revertedWith("Invalid treasury");
    });

    it("should revert when mintPool is zero address", async function () {
      const [owner, treasury] = await ethers.getSigners();
      const MockPoolManager = await ethers.getContractFactory("MockPoolManager");
      const pm = await MockPoolManager.deploy();
      const BonzaiUniswapHook = await ethers.getContractFactory("BonzaiUniswapHook");
      await expect(
        BonzaiUniswapHook.deploy(await pm.getAddress(), treasury.address, ethers.ZeroAddress, owner.address)
      ).to.be.revertedWith("Invalid MintPool");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // registerPool()
  // ═══════════════════════════════════════════════════════════════════════════

  describe("registerPool()", function () {
    it("should register a COMPANION pool when called by authorized factory", async function () {
      const { hook, owner, beneficiary, mockCompanionsAddr } = await loadFixture(deployHook);
      const hookAddr = await hook.getAddress();
      const key = makePoolKey(hookAddr);
      const poolId = computePoolId(key);

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_COMPANION, 0, mockCompanionsAddr);

      const config = await hook.getPoolConfig(poolId);
      expect(config.beneficiary).to.equal(beneficiary.address);
      // companionOwner is now zero in storage — read live from NFT at swap time
      expect(config.companionOwner).to.equal(ethers.ZeroAddress);
      expect(config.poolType).to.equal(POOL_TYPE_COMPANION);
      expect(config.active).to.be.true;
    });

    it("should register a FINETUNE pool when called by authorized factory", async function () {
      const { hook, owner, beneficiary, mockCompanionsAddr } = await loadFixture(deployHook);
      const poolId = ethers.keccak256(ethers.toUtf8Bytes("finetune-pool-1"));

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_FINETUNE, 5, mockCompanionsAddr);

      const config = await hook.getPoolConfig(poolId);
      expect(config.beneficiary).to.equal(beneficiary.address);
      expect(config.companionOwner).to.equal(ethers.ZeroAddress);
      expect(config.poolType).to.equal(POOL_TYPE_FINETUNE);
      expect(config.mintPoolIndex).to.equal(5);
      expect(config.active).to.be.true;
    });

    it("should emit PoolRegistered event", async function () {
      const { hook, owner, beneficiary, mockCompanionsAddr } = await loadFixture(deployHook);
      const poolId = ethers.keccak256(ethers.toUtf8Bytes("test-pool"));

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await expect(
        regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_COMPANION, 0, mockCompanionsAddr)
      )
        .to.emit(hook, "PoolRegistered")
        .withArgs(poolId, beneficiary.address, POOL_TYPE_COMPANION, 0);
    });

    it("should revert when called by non-authorized factory", async function () {
      const { hook, user1, beneficiary, mockCompanionsAddr } = await loadFixture(deployHook);
      const poolId = ethers.keccak256(ethers.toUtf8Bytes("test-pool"));

      await expect(
        regPool(hook, user1, poolId, beneficiary.address, POOL_TYPE_COMPANION, 0, mockCompanionsAddr)
      ).to.be.revertedWith("Not authorized factory");
    });

    it("should revert when beneficiary is zero address", async function () {
      const { hook, owner, mockCompanionsAddr } = await loadFixture(deployHook);
      const poolId = ethers.keccak256(ethers.toUtf8Bytes("test-pool"));

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await expect(
        regPool(hook, owner, poolId, ethers.ZeroAddress, POOL_TYPE_COMPANION, 0, mockCompanionsAddr)
      ).to.be.revertedWith("Invalid beneficiary");
    });

    it("should revert when COMPANION pool has zero NFT contract", async function () {
      const { hook, owner, beneficiary } = await loadFixture(deployHook);
      const poolId = ethers.keccak256(ethers.toUtf8Bytes("test-pool"));

      await hook.connect(owner).authorizeFactory(owner.address, true);
      // Pass zero NFT addr explicitly (not via regPool helper)
      await expect(
        hook.connect(owner).registerPool(poolId, beneficiary.address, ethers.ZeroAddress, 1n, POOL_TYPE_COMPANION, 0)
      ).to.be.revertedWith("Companion pool requires NFT contract");
    });

    it("should revert when COMPANION pool has zero token id", async function () {
      const { hook, owner, beneficiary, mockCompanionsAddr } = await loadFixture(deployHook);
      const poolId = ethers.keccak256(ethers.toUtf8Bytes("test-pool"));

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await expect(
        hook.connect(owner).registerPool(poolId, beneficiary.address, mockCompanionsAddr, 0n, POOL_TYPE_COMPANION, 0)
      ).to.be.revertedWith("Companion pool requires NFT id");
    });

    it("should revert when FINETUNE pool has mintPoolIndex >= 6", async function () {
      const { hook, owner, beneficiary, mockCompanionsAddr } = await loadFixture(deployHook);
      const poolId = ethers.keccak256(ethers.toUtf8Bytes("test-pool"));

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await expect(
        regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_FINETUNE, 6, mockCompanionsAddr)
      ).to.be.revertedWith("Invalid mint pool index");
    });

    it("should revert when registering a pool that is already active", async function () {
      const { hook, owner, beneficiary, mockCompanionsAddr } = await loadFixture(deployHook);
      const poolId = ethers.keccak256(ethers.toUtf8Bytes("test-pool"));

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_COMPANION, 0, mockCompanionsAddr);

      await expect(
        regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_COMPANION, 0, mockCompanionsAddr)
      ).to.be.revertedWith("Pool already registered");
    });

    it("should allow FINETUNE pool with mintPoolIndex 0 through 5", async function () {
      const { hook, owner, beneficiary, mockCompanionsAddr } = await loadFixture(deployHook);

      await hook.connect(owner).authorizeFactory(owner.address, true);

      for (let i = 0; i < 6; i++) {
        const poolId = ethers.keccak256(ethers.toUtf8Bytes(`finetune-pool-${i}`));
        await regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_FINETUNE, i, mockCompanionsAddr);
        const config = await hook.getPoolConfig(poolId);
        expect(config.mintPoolIndex).to.equal(i);
        expect(config.active).to.be.true;
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // deregisterPool()
  // ═══════════════════════════════════════════════════════════════════════════

  describe("deregisterPool()", function () {
    it("should deregister an active pool (onlyOwner)", async function () {
      const { hook, owner, beneficiary, mockCompanionsAddr } = await loadFixture(deployHook);
      const poolId = ethers.keccak256(ethers.toUtf8Bytes("test-pool"));

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_COMPANION, 0, mockCompanionsAddr);

      await hook.connect(owner).deregisterPool(poolId);

      const config = await hook.getPoolConfig(poolId);
      expect(config.active).to.be.false;
    });

    it("should emit PoolDeregistered event", async function () {
      const { hook, owner, beneficiary, mockCompanionsAddr } = await loadFixture(deployHook);
      const poolId = ethers.keccak256(ethers.toUtf8Bytes("test-pool"));

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_COMPANION, 0, mockCompanionsAddr);

      await expect(hook.connect(owner).deregisterPool(poolId))
        .to.emit(hook, "PoolDeregistered")
        .withArgs(poolId);
    });

    it("should revert when called by non-owner", async function () {
      const { hook, owner, user1, beneficiary, mockCompanionsAddr } = await loadFixture(deployHook);
      const poolId = ethers.keccak256(ethers.toUtf8Bytes("test-pool"));

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_COMPANION, 0, mockCompanionsAddr);

      await expect(
        hook.connect(user1).deregisterPool(poolId)
      ).to.be.revertedWithCustomError(hook, "OwnableUnauthorizedAccount");
    });

    it("should revert when pool is not active", async function () {
      const { hook, owner } = await loadFixture(deployHook);
      const poolId = ethers.keccak256(ethers.toUtf8Bytes("non-existent"));

      await expect(
        hook.connect(owner).deregisterPool(poolId)
      ).to.be.revertedWith("Pool not active");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // afterSwap()
  // ═══════════════════════════════════════════════════════════════════════════

  describe("afterSwap()", function () {
    /**
     * Fixture that deploys and registers a COMPANION pool ready for afterSwap.
     */
    async function deployWithCompanionPool() {
      const base = await deployHook();
      const { hook, owner, beneficiary, mockCompanionsAddr } = base;
      const hookAddr = await hook.getAddress();
      const key = makePoolKey(hookAddr);
      const poolId = computePoolId(key);

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_COMPANION, 0, mockCompanionsAddr);

      return { ...base, key, poolId };
    }

    /**
     * Fixture that deploys and registers a FINETUNE pool ready for afterSwap.
     */
    async function deployWithFineTunePool() {
      const base = await deployHook();
      const { hook, owner, beneficiary, mockCompanionsAddr } = base;
      const hookAddr = await hook.getAddress();
      const key = makePoolKey(hookAddr);
      const poolId = computePoolId(key);
      const mintPoolIndex = 5;

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_FINETUNE, mintPoolIndex, mockCompanionsAddr);

      return { ...base, key, poolId, mintPoolIndex };
    }

    it("should capture 1% fee on COMPANION pool swap (negative delta)", async function () {
      const { hook, poolManager, key, beneficiary, companionOwner, user1 } =
        await loadFixture(deployWithCompanionPool);
      const hookAddr = await hook.getAddress();
      const pmAddr = await poolManager.getAddress();
      const swapOutput = ethers.parseEther("1");
      const delta = -swapOutput;

      await user1.sendTransaction({ to: pmAddr, value: swapOutput });

      await poolManager.callAfterSwap(
        hookAddr,
        user1.address,
        key,
        makeSwapParams(),
        delta,
        "0x"
      );

      const expectedFee = (swapOutput * HOOK_FEE_BPS) / BPS_DENOMINATOR;
      expect(expectedFee).to.equal(ethers.parseEther("0.01"));

      // Total fees split across: agent wallet (beneficiary) + owner (companionOwner via live ownerOf) + treasury + 6-bucket pool
      const poolTotal = await sumPoolBuckets(hook);
      const ownerFees = await hook.unclaimedBeneficiary(companionOwner.address);
      const walletFees = await hook.unclaimedBeneficiary(beneficiary.address);
      const treasuryFees = await hook.unclaimedTreasury();
      expect(poolTotal + ownerFees + walletFees + treasuryFees).to.equal(expectedFee);
    });

    it("should split COMPANION fees 40/40/10/10 (wallet/owner/treasury/MintPool)", async function () {
      const { hook, poolManager, key, beneficiary, companionOwner, user1 } =
        await loadFixture(deployWithCompanionPool);
      const hookAddr = await hook.getAddress();
      const pmAddr = await poolManager.getAddress();
      const swapOutput = ethers.parseEther("10");
      const delta = -swapOutput;

      await user1.sendTransaction({ to: pmAddr, value: swapOutput });

      await poolManager.callAfterSwap(hookAddr, user1.address, key, makeSwapParams(), delta, "0x");

      const feeAmount = (swapOutput * HOOK_FEE_BPS) / BPS_DENOMINATOR; // 0.1 ETH
      const expectedWallet = (feeAmount * COMPANION_WALLET_BPS) / BPS_DENOMINATOR; // 40%
      const expectedOwner = (feeAmount * COMPANION_OWNER_BPS) / BPS_DENOMINATOR; // 40%
      const expectedTreasury = (feeAmount * COMPANION_TREASURY_BPS) / BPS_DENOMINATOR; // 10%
      const expectedPool = feeAmount - expectedWallet - expectedOwner - expectedTreasury; // 10%

      expect(await hook.unclaimedBeneficiary(beneficiary.address)).to.equal(expectedWallet);
      expect(await hook.unclaimedBeneficiary(companionOwner.address)).to.equal(expectedOwner);
      expect(await hook.unclaimedTreasury()).to.equal(expectedTreasury);
      expect(await sumPoolBuckets(hook)).to.equal(expectedPool);
    });

    it("should split FINETUNE fees 80/10/10 (beneficiary/treasury/pool spread across 6 buckets)", async function () {
      const { hook, poolManager, key, beneficiary, user1 } =
        await loadFixture(deployWithFineTunePool);
      const hookAddr = await hook.getAddress();
      const pmAddr = await poolManager.getAddress();
      const swapOutput = ethers.parseEther("10");
      const delta = -swapOutput;

      await user1.sendTransaction({ to: pmAddr, value: swapOutput });

      await poolManager.callAfterSwap(hookAddr, user1.address, key, makeSwapParams(), delta, "0x");

      const feeAmount = (swapOutput * HOOK_FEE_BPS) / BPS_DENOMINATOR;
      const expectedBeneficiary = (feeAmount * FINETUNE_BENEFICIARY_BPS) / BPS_DENOMINATOR;
      const expectedTreasury = (feeAmount * FINETUNE_TREASURY_BPS) / BPS_DENOMINATOR;
      const expectedPool = feeAmount - expectedBeneficiary - expectedTreasury;

      expect(await hook.unclaimedBeneficiary(beneficiary.address)).to.equal(expectedBeneficiary);
      expect(await hook.unclaimedTreasury()).to.equal(expectedTreasury);
      expect(await sumPoolBuckets(hook)).to.equal(expectedPool);
    });

    it("should only allow PoolManager to call afterSwap", async function () {
      const { hook, key, user1 } = await loadFixture(deployWithCompanionPool);

      await expect(
        hook.connect(user1).afterSwap(
          user1.address,
          key,
          makeSwapParams(),
          -ethers.parseEther("1"),
          "0x"
        )
      ).to.be.revertedWith("Only PoolManager");
    });

    it("should pass through with no fee for unregistered pool", async function () {
      const { hook, poolManager, user1 } = await loadFixture(deployHook);
      const hookAddr = await hook.getAddress();
      const pmAddr = await poolManager.getAddress();

      const key = makePoolKey(hookAddr, "0x0000000000000000000000000000000000000099");
      const delta = -ethers.parseEther("1");

      await user1.sendTransaction({ to: pmAddr, value: ethers.parseEther("1") });

      const [, hookDelta] = await poolManager.callAfterSwap.staticCall(
        hookAddr,
        user1.address,
        key,
        makeSwapParams(),
        delta,
        "0x"
      );

      expect(hookDelta).to.equal(0);
      expect(await hook.unclaimedTreasury()).to.equal(0);
    });

    it("should return no fee when delta is zero", async function () {
      const { hook, poolManager, key, user1 } = await loadFixture(deployWithCompanionPool);
      const hookAddr = await hook.getAddress();

      const [, hookDelta] = await poolManager.callAfterSwap.staticCall(
        hookAddr,
        user1.address,
        key,
        makeSwapParams(),
        0,
        "0x"
      );

      expect(hookDelta).to.equal(0);
    });

    it("should return no fee when delta is positive (no output)", async function () {
      const { hook, poolManager, key, user1 } = await loadFixture(deployWithCompanionPool);
      const hookAddr = await hook.getAddress();

      const [, hookDelta] = await poolManager.callAfterSwap.staticCall(
        hookAddr,
        user1.address,
        key,
        makeSwapParams(),
        ethers.parseEther("1"),
        "0x"
      );

      expect(hookDelta).to.equal(0);
    });

    it("should return negative hookDelta equal to fee amount", async function () {
      const { hook, poolManager, key, user1 } = await loadFixture(deployWithCompanionPool);
      const hookAddr = await hook.getAddress();
      const pmAddr = await poolManager.getAddress();
      const swapOutput = ethers.parseEther("1");

      await user1.sendTransaction({ to: pmAddr, value: swapOutput });

      const [, hookDelta] = await poolManager.callAfterSwap.staticCall(
        hookAddr,
        user1.address,
        key,
        makeSwapParams(),
        -swapOutput,
        "0x"
      );

      const expectedFee = (swapOutput * HOOK_FEE_BPS) / BPS_DENOMINATOR;
      expect(hookDelta).to.equal(-expectedFee);
    });

    it("should emit FeeCaptured event for COMPANION swap", async function () {
      const { hook, poolManager, key, poolId, user1 } =
        await loadFixture(deployWithCompanionPool);
      const hookAddr = await hook.getAddress();
      const pmAddr = await poolManager.getAddress();
      const swapOutput = ethers.parseEther("10");

      await user1.sendTransaction({ to: pmAddr, value: swapOutput });

      const feeAmount = (swapOutput * HOOK_FEE_BPS) / BPS_DENOMINATOR;
      const walletShare = (feeAmount * COMPANION_WALLET_BPS) / BPS_DENOMINATOR;
      const ownerShare = (feeAmount * COMPANION_OWNER_BPS) / BPS_DENOMINATOR;
      const treasuryShare = (feeAmount * COMPANION_TREASURY_BPS) / BPS_DENOMINATOR;
      const poolShare = feeAmount - walletShare - ownerShare - treasuryShare;

      await expect(
        poolManager.callAfterSwap(hookAddr, user1.address, key, makeSwapParams(), -swapOutput, "0x")
      )
        .to.emit(hook, "FeeCaptured")
        .withArgs(poolId, POOL_TYPE_COMPANION, feeAmount, walletShare, ownerShare, treasuryShare, poolShare);
    });

    it("should emit FeeCaptured event for FINETUNE swap", async function () {
      const { hook, poolManager, key, poolId, user1 } =
        await loadFixture(deployWithFineTunePool);
      const hookAddr = await hook.getAddress();
      const pmAddr = await poolManager.getAddress();
      const swapOutput = ethers.parseEther("10");

      await user1.sendTransaction({ to: pmAddr, value: swapOutput });

      const feeAmount = (swapOutput * HOOK_FEE_BPS) / BPS_DENOMINATOR;
      const beneficiaryShare = (feeAmount * FINETUNE_BENEFICIARY_BPS) / BPS_DENOMINATOR;
      const treasuryShare = (feeAmount * FINETUNE_TREASURY_BPS) / BPS_DENOMINATOR;
      const poolShare = feeAmount - beneficiaryShare - treasuryShare;

      await expect(
        poolManager.callAfterSwap(hookAddr, user1.address, key, makeSwapParams(), -swapOutput, "0x")
      )
        .to.emit(hook, "FeeCaptured")
        .withArgs(poolId, POOL_TYPE_FINETUNE, feeAmount, beneficiaryShare, 0, treasuryShare, poolShare);
    });

    it("should accumulate fees across multiple swaps", async function () {
      const { hook, poolManager, key, beneficiary, companionOwner, user1 } =
        await loadFixture(deployWithCompanionPool);
      const hookAddr = await hook.getAddress();
      const pmAddr = await poolManager.getAddress();

      for (let i = 0; i < 2; i++) {
        await user1.sendTransaction({ to: pmAddr, value: ethers.parseEther("1") });
        await poolManager.callAfterSwap(
          hookAddr,
          user1.address,
          key,
          makeSwapParams(),
          -ethers.parseEther("1"),
          "0x"
        );
      }

      const totalFee = (ethers.parseEther("2") * HOOK_FEE_BPS) / BPS_DENOMINATOR;
      const poolFees = await sumPoolBuckets(hook);
      const ownerFees = await hook.unclaimedBeneficiary(companionOwner.address);
      const walletFees = await hook.unclaimedBeneficiary(beneficiary.address);
      const treasuryFees = await hook.unclaimedTreasury();

      expect(poolFees + ownerFees + walletFees + treasuryFees).to.equal(totalFee);
    });

    it("should not capture fees after pool is deregistered", async function () {
      const { hook, poolManager, key, owner, user1 } =
        await loadFixture(deployWithCompanionPool);
      const hookAddr = await hook.getAddress();
      const pmAddr = await poolManager.getAddress();
      const poolId = computePoolId(key);

      await hook.connect(owner).deregisterPool(poolId);

      await user1.sendTransaction({ to: pmAddr, value: ethers.parseEther("1") });
      const [, hookDelta] = await poolManager.callAfterSwap.staticCall(
        hookAddr,
        user1.address,
        key,
        makeSwapParams(),
        -ethers.parseEther("1"),
        "0x"
      );

      expect(hookDelta).to.equal(0);
      expect(await hook.unclaimedTreasury()).to.equal(0);
    });

    it("should update totalUnclaimedBeneficiary for COMPANION swaps", async function () {
      const { hook, poolManager, key, user1 } =
        await loadFixture(deployWithCompanionPool);
      const hookAddr = await hook.getAddress();
      const pmAddr = await poolManager.getAddress();
      const swapOutput = ethers.parseEther("10");

      await user1.sendTransaction({ to: pmAddr, value: swapOutput });
      await poolManager.callAfterSwap(hookAddr, user1.address, key, makeSwapParams(), -swapOutput, "0x");

      const feeAmount = (swapOutput * HOOK_FEE_BPS) / BPS_DENOMINATOR;
      const walletShare = (feeAmount * COMPANION_WALLET_BPS) / BPS_DENOMINATOR;
      const ownerShare = (feeAmount * COMPANION_OWNER_BPS) / BPS_DENOMINATOR;

      // totalUnclaimedBeneficiary tracks wallet + owner (treasury + pool slices have separate counters)
      expect(await hook.totalUnclaimedBeneficiary()).to.equal(walletShare + ownerShare);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLAIM FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("claimBeneficiaryFees()", function () {
    async function deployWithAccumulatedCompanionFees() {
      const base = await deployHook();
      const { hook, poolManager, owner, beneficiary, user1, mockCompanionsAddr } = base;
      const hookAddr = await hook.getAddress();
      const key = makePoolKey(hookAddr);
      const poolId = computePoolId(key);

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_COMPANION, 0, mockCompanionsAddr);

      const swapOutput = ethers.parseEther("10");
      const pmAddr = await poolManager.getAddress();
      await user1.sendTransaction({ to: pmAddr, value: swapOutput });
      await poolManager.callAfterSwap(hookAddr, user1.address, key, makeSwapParams(), -swapOutput, "0x");

      return { ...base, key, poolId, swapOutput };
    }

    it("should allow beneficiary to claim accumulated fees", async function () {
      const { hook, beneficiary } = await loadFixture(deployWithAccumulatedCompanionFees);
      const fees = await hook.unclaimedBeneficiary(beneficiary.address);
      expect(fees).to.be.gt(0);

      const balBefore = await ethers.provider.getBalance(beneficiary.address);
      const tx = await hook.connect(beneficiary).claimBeneficiaryFees();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balAfter = await ethers.provider.getBalance(beneficiary.address);

      expect(balAfter - balBefore + gasUsed).to.equal(fees);
      expect(await hook.unclaimedBeneficiary(beneficiary.address)).to.equal(0);
    });

    it("should emit BeneficiaryFeesClaimed event", async function () {
      const { hook, beneficiary } = await loadFixture(deployWithAccumulatedCompanionFees);
      const fees = await hook.unclaimedBeneficiary(beneficiary.address);

      await expect(hook.connect(beneficiary).claimBeneficiaryFees())
        .to.emit(hook, "BeneficiaryFeesClaimed")
        .withArgs(beneficiary.address, fees);
    });

    it("should decrement totalUnclaimedBeneficiary after claim", async function () {
      const { hook, beneficiary } = await loadFixture(deployWithAccumulatedCompanionFees);
      const fees = await hook.unclaimedBeneficiary(beneficiary.address);
      const totalBefore = await hook.totalUnclaimedBeneficiary();

      await hook.connect(beneficiary).claimBeneficiaryFees();

      expect(await hook.totalUnclaimedBeneficiary()).to.equal(totalBefore - fees);
    });

    it("should revert when msg.sender has no unclaimed fees", async function () {
      const { hook, user1 } = await loadFixture(deployHook);

      await expect(
        hook.connect(user1).claimBeneficiaryFees()
      ).to.be.revertedWith("No fees to claim");
    });
  });

  describe("claimTreasuryFees()", function () {
    async function deployWithAccumulatedTreasuryFees() {
      // Either pool type produces treasury fees now (companion: 10%, finetune: 10%)
      const base = await deployHook();
      const { hook, poolManager, owner, beneficiary, user1, mockCompanionsAddr } = base;
      const hookAddr = await hook.getAddress();
      const key = makePoolKey(hookAddr);
      const poolId = computePoolId(key);

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_FINETUNE, 5, mockCompanionsAddr);

      const swapOutput = ethers.parseEther("10");
      const pmAddr = await poolManager.getAddress();
      await user1.sendTransaction({ to: pmAddr, value: swapOutput });
      await poolManager.callAfterSwap(hookAddr, user1.address, key, makeSwapParams(), -swapOutput, "0x");

      return { ...base, key, poolId, swapOutput };
    }

    it("should send accumulated treasury fees to treasury address", async function () {
      const { hook, treasury } = await loadFixture(deployWithAccumulatedTreasuryFees);
      const fees = await hook.unclaimedTreasury();
      expect(fees).to.be.gt(0);

      const balBefore = await ethers.provider.getBalance(treasury.address);
      await hook.claimTreasuryFees();
      const balAfter = await ethers.provider.getBalance(treasury.address);

      expect(balAfter - balBefore).to.equal(fees);
      expect(await hook.unclaimedTreasury()).to.equal(0);
    });

    it("should emit TreasuryFeesClaimed event", async function () {
      const { hook, treasury } = await loadFixture(deployWithAccumulatedTreasuryFees);
      const fees = await hook.unclaimedTreasury();

      await expect(hook.claimTreasuryFees())
        .to.emit(hook, "TreasuryFeesClaimed")
        .withArgs(treasury.address, fees);
    });

    it("should revert when no treasury fees to claim", async function () {
      const { hook } = await loadFixture(deployHook);

      await expect(hook.claimTreasuryFees()).to.be.revertedWith("No treasury fees to claim");
    });
  });

  describe("claimPoolFees()", function () {
    async function deployWithAccumulatedPoolFees() {
      const base = await deployHook();
      const { hook, poolManager, owner, beneficiary, user1, mockCompanionsAddr } = base;
      const hookAddr = await hook.getAddress();
      const key = makePoolKey(hookAddr);
      const poolId = computePoolId(key);
      const mintPoolIndex = 5;

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_FINETUNE, mintPoolIndex, mockCompanionsAddr);

      const swapOutput = ethers.parseEther("10");
      const pmAddr = await poolManager.getAddress();
      await user1.sendTransaction({ to: pmAddr, value: swapOutput });
      await poolManager.callAfterSwap(hookAddr, user1.address, key, makeSwapParams(), -swapOutput, "0x");

      return { ...base, key, poolId, mintPoolIndex, swapOutput };
    }

    it("should call mintPool.depositForPool with accumulated fees for each bucket", async function () {
      const { hook, mockPool } = await loadFixture(deployWithAccumulatedPoolFees);

      // Pool slice is spread across all 6 buckets — claim each one
      for (let i = 0; i < NUM_POOLS; i++) {
        const fees = await hook.unclaimedPool(i);
        if (fees === 0n) continue;
        await hook.claimPoolFees(i);
        expect(await mockPool.poolDeposits(i)).to.equal(fees);
        expect(await hook.unclaimedPool(i)).to.equal(0);
      }
    });

    it("should emit PoolFeesClaimed event", async function () {
      const { hook } = await loadFixture(deployWithAccumulatedPoolFees);
      // Bucket 0 always receives the equal share (perPool); use it for the event check
      const fees = await hook.unclaimedPool(0);
      expect(fees).to.be.gt(0);

      await expect(hook.claimPoolFees(0))
        .to.emit(hook, "PoolFeesClaimed")
        .withArgs(0, fees);
    });

    it("should revert when mintPoolIndex >= 6", async function () {
      const { hook } = await loadFixture(deployHook);
      await expect(hook.claimPoolFees(6)).to.be.revertedWith("Invalid pool index");
    });

    it("should revert when no pool fees to claim", async function () {
      const { hook } = await loadFixture(deployHook);
      await expect(hook.claimPoolFees(0)).to.be.revertedWith("No pool fees to claim");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // withdrawSurplus()
  // ═══════════════════════════════════════════════════════════════════════════

  describe("withdrawSurplus()", function () {
    it("should withdraw only surplus ETH above accountable totals", async function () {
      const { hook, owner, poolManager, beneficiary, user1, mockCompanionsAddr } = await loadFixture(deployHook);
      const hookAddr = await hook.getAddress();
      const key = makePoolKey(hookAddr);
      const poolId = computePoolId(key);

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_COMPANION, 0, mockCompanionsAddr);

      const swapOutput = ethers.parseEther("10");
      const pmAddr = await poolManager.getAddress();
      await user1.sendTransaction({ to: pmAddr, value: swapOutput });
      await poolManager.callAfterSwap(hookAddr, user1.address, key, makeSwapParams(), -swapOutput, "0x");

      // Send extra ETH directly to the hook (surplus)
      const surplus = ethers.parseEther("0.5");
      await user1.sendTransaction({ to: hookAddr, value: surplus });

      const ownerBalBefore = await ethers.provider.getBalance(owner.address);
      const tx = await hook.connect(owner).withdrawSurplus();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const ownerBalAfter = await ethers.provider.getBalance(owner.address);

      expect(ownerBalAfter - ownerBalBefore + gasUsed).to.equal(surplus);
    });

    it("should revert when no surplus exists", async function () {
      const { hook, owner } = await loadFixture(deployHook);

      await expect(
        hook.connect(owner).withdrawSurplus()
      ).to.be.revertedWith("No surplus");
    });

    it("should revert when called by non-owner", async function () {
      const { hook, user1 } = await loadFixture(deployHook);
      const hookAddr = await hook.getAddress();
      await user1.sendTransaction({ to: hookAddr, value: ethers.parseEther("1") });

      await expect(
        hook.connect(user1).withdrawSurplus()
      ).to.be.revertedWithCustomError(hook, "OwnableUnauthorizedAccount");
    });

    it("should not withdraw ETH that is accounted for in unclaimedPool", async function () {
      const { hook, owner, poolManager, beneficiary, user1, mockCompanionsAddr } = await loadFixture(deployHook);
      const hookAddr = await hook.getAddress();
      const key = makePoolKey(hookAddr);
      const poolId = computePoolId(key);

      await hook.connect(owner).authorizeFactory(owner.address, true);
      await regPool(hook, owner, poolId, beneficiary.address, POOL_TYPE_FINETUNE, 3, mockCompanionsAddr);

      const swapOutput = ethers.parseEther("10");
      const pmAddr = await poolManager.getAddress();
      await user1.sendTransaction({ to: pmAddr, value: swapOutput });
      await poolManager.callAfterSwap(hookAddr, user1.address, key, makeSwapParams(), -swapOutput, "0x");

      await expect(
        hook.connect(owner).withdrawSurplus()
      ).to.be.revertedWith("No surplus");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("authorizeFactory()", function () {
    it("should authorize a factory address", async function () {
      const { hook, owner, user1 } = await loadFixture(deployHook);

      await hook.connect(owner).authorizeFactory(user1.address, true);
      expect(await hook.authorizedFactories(user1.address)).to.be.true;
    });

    it("should deauthorize a factory address", async function () {
      const { hook, owner, user1 } = await loadFixture(deployHook);

      await hook.connect(owner).authorizeFactory(user1.address, true);
      await hook.connect(owner).authorizeFactory(user1.address, false);
      expect(await hook.authorizedFactories(user1.address)).to.be.false;
    });

    it("should emit FactoryAuthorized event", async function () {
      const { hook, owner, user1 } = await loadFixture(deployHook);

      await expect(hook.connect(owner).authorizeFactory(user1.address, true))
        .to.emit(hook, "FactoryAuthorized")
        .withArgs(user1.address, true);
    });

    it("should revert when called by non-owner", async function () {
      const { hook, user1 } = await loadFixture(deployHook);

      await expect(
        hook.connect(user1).authorizeFactory(user1.address, true)
      ).to.be.revertedWithCustomError(hook, "OwnableUnauthorizedAccount");
    });

    it("should revert when factory address is zero", async function () {
      const { hook, owner } = await loadFixture(deployHook);

      await expect(
        hook.connect(owner).authorizeFactory(ethers.ZeroAddress, true)
      ).to.be.revertedWith("Invalid factory address");
    });
  });

  describe("setTreasury()", function () {
    it("should update the treasury address", async function () {
      const { hook, owner, user1 } = await loadFixture(deployHook);

      await hook.connect(owner).setTreasury(user1.address);
      expect(await hook.treasury()).to.equal(user1.address);
    });

    it("should emit TreasuryUpdated event", async function () {
      const { hook, owner, treasury, user1 } = await loadFixture(deployHook);

      await expect(hook.connect(owner).setTreasury(user1.address))
        .to.emit(hook, "TreasuryUpdated")
        .withArgs(treasury.address, user1.address);
    });

    it("should revert when called by non-owner", async function () {
      const { hook, user1 } = await loadFixture(deployHook);

      await expect(
        hook.connect(user1).setTreasury(user1.address)
      ).to.be.revertedWithCustomError(hook, "OwnableUnauthorizedAccount");
    });

    it("should revert when new treasury is zero address", async function () {
      const { hook, owner } = await loadFixture(deployHook);

      await expect(
        hook.connect(owner).setTreasury(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid treasury");
    });
  });

  describe("setMintPool()", function () {
    it("should update the mintPool address", async function () {
      const { hook, owner, user1 } = await loadFixture(deployHook);

      await hook.connect(owner).setMintPool(user1.address);
      expect(await hook.mintPool()).to.equal(user1.address);
    });

    it("should emit MintPoolUpdated event", async function () {
      const { hook, owner, mockPool, user1 } = await loadFixture(deployHook);

      await expect(hook.connect(owner).setMintPool(user1.address))
        .to.emit(hook, "MintPoolUpdated")
        .withArgs(await mockPool.getAddress(), user1.address);
    });

    it("should revert when called by non-owner", async function () {
      const { hook, user1 } = await loadFixture(deployHook);

      await expect(
        hook.connect(user1).setMintPool(user1.address)
      ).to.be.revertedWithCustomError(hook, "OwnableUnauthorizedAccount");
    });

    it("should revert when new mintPool is zero address", async function () {
      const { hook, owner } = await loadFixture(deployHook);

      await expect(
        hook.connect(owner).setMintPool(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid MintPool");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("View functions", function () {
    it("getHookPermissions() should return 0x0090", async function () {
      const { hook } = await loadFixture(deployHook);
      expect(await hook.getHookPermissions()).to.equal(0x0090);
    });

    it("getPoolConfig() should return default values for unregistered pool", async function () {
      const { hook } = await loadFixture(deployHook);
      const poolId = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));
      const config = await hook.getPoolConfig(poolId);

      expect(config.beneficiary).to.equal(ethers.ZeroAddress);
      expect(config.active).to.be.false;
    });

    it("getUnclaimedFees() should return 0 for address with no fees", async function () {
      const { hook, user1 } = await loadFixture(deployHook);
      expect(await hook.getUnclaimedFees(user1.address)).to.equal(0);
    });
  });
});
