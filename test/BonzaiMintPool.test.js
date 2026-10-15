const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time, mine } = require("@nomicfoundation/hardhat-network-helpers");
const {
  EPOCH_DURATION,
  POOL_THRESHOLDS,
  POOL_THRESHOLDS_WEI,
  MIN_CLAIM_BLOCK_GAP,
  NUM_POOLS,
  PROVIDER_SHARE_BPS,
} = require("./helpers/constants");
const { deployMintPool } = require("./helpers/deploy");

const BPS = 10000n;

describe("BonzaiMintPool", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS — Arbitrum-local: balance read directly on-chain, no CRE.
  // ═══════════════════════════════════════════════════════════════════════════

  async function lockUserStake(mintPool, user) {
    const token = await ethers.getContractAt("MockERC20", await mintPool.bonzaiToken());
    const vault = await ethers.getContractAt("BonzaiStakingVault", await mintPool.stakingVault());
    const liquid = await token.balanceOf(user.address);
    if (liquid > 0n) {
      await token.connect(user).approve(await vault.getAddress(), liquid);
      await vault.connect(user).stake(liquid, 30 * 86400);
    }
  }
  async function stakeAndRegisterUser(mintPool, user) {
    await lockUserStake(mintPool, user);
    return mintPool.connect(user).registerForEpoch();
  }
  async function confirmUserClaim(mintPool, user, epochId) {
    return mintPool.connect(user).confirmClaim(epochId);
  }
  async function recordMintFor(mintPool, asAuthorized, user, poolIndex) {
    if ((await mintPool.collectiblesFactory()) !== asAuthorized.address) {
      await mintPool.setCollectiblesFactory(asAuthorized.address);
    }
    if (!(await mintPool.authorizedMinters(asAuthorized.address))) {
      await mintPool.connect(asAuthorized).setAuthorizedMinter(asAuthorized.address, true);
    }
    return mintPool.connect(asAuthorized).recordMint(user.address, poolIndex);
  }

  /**
   * Set up a complete claim flow:
   *   - Mint BONZAI to two users (LVL5, LVL1).
   *   - Authorize treasury as content contract (depositor + recorder).
   *   - Register both users in epoch 0.
   *   - Deposit 10 ETH into pool 0 (text).
   *   - recordMint for both users in pool 0.
   *   - Advance to epoch 1, confirmClaim, mine 256 blocks.
   */
  async function setupFullClaimFlow() {
    const { mintPool, token, owner, user1, user2, user3, treasury } =
      await loadFixture(deployMintPool);

    const user1Amount = ethers.parseEther("50000");
    const user2Amount = ethers.parseEther("1000");
    await token.mint(user1.address, user1Amount);
    await token.mint(user2.address, user2Amount);

    // Treasury impersonates both contentContract (depositor) and the
    // collectibles factory (recordMint authorizer).
    await mintPool.setContentContract(treasury.address);
    await mintPool.setCollectiblesFactory(treasury.address);
    await mintPool.connect(treasury).setAuthorizedMinter(treasury.address, true);

    await lockUserStake(mintPool, user1);
    await lockUserStake(mintPool, user2);
    // Use auto-mine off + manual mine so both registrations hit the same
    // block, yielding identical time-weighted multipliers.
    await ethers.provider.send("evm_setAutomine", [false]);
    await mintPool.connect(user1).registerForEpoch();
    await mintPool.connect(user2).registerForEpoch();
    await ethers.provider.send("evm_mine", []);
    await ethers.provider.send("evm_setAutomine", [true]);

    const depositAmount = ethers.parseEther("10");
    await mintPool.connect(treasury).depositForPool(0, { value: depositAmount });

    await recordMintFor(mintPool, treasury, user1, 0);
    await recordMintFor(mintPool, treasury, user2, 0);

    await time.increase(EPOCH_DURATION);
    await confirmUserClaim(mintPool, user1, 0);
    await confirmUserClaim(mintPool, user2, 0);
    await mine(MIN_CLAIM_BLOCK_GAP);

    return {
      mintPool,
      token,
      owner,
      user1,
      user2,
      user3,
      treasury,
      user1Amount,
      user2Amount,
      depositAmount,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("sets correct initial state", async function () {
      const { mintPool, token, treasury } = await loadFixture(deployMintPool);
      expect(await mintPool.bonzaiToken()).to.equal(await token.getAddress());
      expect(await mintPool.epochDuration()).to.equal(EPOCH_DURATION);
      expect(await mintPool.treasury()).to.equal(treasury.address);
      expect(await mintPool.providerShareBps()).to.equal(PROVIDER_SHARE_BPS);
      expect(await mintPool.currentEpoch()).to.equal(0);
    });

    it("reverts with zero token address", async function () {
      const [, , , , treasury] = await ethers.getSigners();
      const BonzaiMintPool = await ethers.getContractFactory("BonzaiMintPool");
      await expect(
        BonzaiMintPool.deploy(ethers.ZeroAddress, POOL_THRESHOLDS, EPOCH_DURATION, treasury.address)
      ).to.be.revertedWith("Invalid token address");
    });

    it("reverts with zero epoch duration", async function () {
      const [, , , , treasury] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("BONZAI", "BONZAI");
      const BonzaiMintPool = await ethers.getContractFactory("BonzaiMintPool");
      await expect(
        BonzaiMintPool.deploy(await token.getAddress(), POOL_THRESHOLDS, 0, treasury.address)
      ).to.be.revertedWith("Invalid epoch duration");
    });

    it("reverts with non-ascending thresholds", async function () {
      const [, , , , treasury] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("BONZAI", "BONZAI");
      const BonzaiMintPool = await ethers.getContractFactory("BonzaiMintPool");
      await expect(
        BonzaiMintPool.deploy(
          await token.getAddress(),
          [1000, 5000, 100, 25000, 33000, 50000],
          EPOCH_DURATION,
          treasury.address,
        )
      ).to.be.revertedWith("Thresholds must be ascending");
    });

    it("reverts with zero threshold", async function () {
      const [, , , , treasury] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("BONZAI", "BONZAI");
      const BonzaiMintPool = await ethers.getContractFactory("BonzaiMintPool");
      await expect(
        BonzaiMintPool.deploy(
          await token.getAddress(),
          [0, 5000, 10000, 25000, 33000, 50000],
          EPOCH_DURATION,
          treasury.address,
        )
      ).to.be.revertedWith("Threshold cannot be zero");
    });

    it("seeds the pool thresholds in wei", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      const t = await mintPool.getAllPoolThresholds();
      for (let i = 0; i < NUM_POOLS; i++) {
        expect(t[i]).to.equal(POOL_THRESHOLDS_WEI[i]);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EPOCH MATH
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Epoch math", function () {
    it("currentEpoch advances by EPOCH_DURATION", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      expect(await mintPool.currentEpoch()).to.equal(0);
      await time.increase(EPOCH_DURATION);
      expect(await mintPool.currentEpoch()).to.equal(1);
      await time.increase(EPOCH_DURATION);
      expect(await mintPool.currentEpoch()).to.equal(2);
    });

    it("isEpochFinalized returns true once the epoch ends", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      expect(await mintPool.isEpochFinalized(0)).to.equal(false);
      await time.increase(EPOCH_DURATION);
      expect(await mintPool.isEpochFinalized(0)).to.equal(true);
      expect(await mintPool.isEpochFinalized(1)).to.equal(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRATION (direct, Arbitrum-local)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Registration", function () {
    it("uses the configured staking position instead of the liquid token balance", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      const BonzaiStakingVault = await ethers.getContractFactory("BonzaiStakingVault");
      const stakingVault = await BonzaiStakingVault.deploy(
        await token.getAddress(),
        POOL_THRESHOLDS_WEI,
      );
      await mintPool.setStakingVault(await stakingVault.getAddress());
      await token.mint(user1.address, ethers.parseEther("5000"));
      await expect(mintPool.connect(user1).registerForEpoch()).to.be.revertedWith("Below LVL1 threshold");
      await token.connect(user1).approve(await stakingVault.getAddress(), ethers.MaxUint256);
      await stakingVault.connect(user1).stake(ethers.parseEther("5000"), 30 * 86400);
      await stakeAndRegisterUser(mintPool, user1);
      expect(await mintPool.registeredBalances(0, user1.address)).to.equal(ethers.parseEther("5000"));
    });

    it("registers a user with sufficient BONZAI balance", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("5000"));
      await stakeAndRegisterUser(mintPool, user1);
      expect(await mintPool.isRegistered(0, user1.address)).to.equal(true);
      expect(await mintPool.registeredBalances(0, user1.address)).to.equal(ethers.parseEther("5000"));
    });

    it("reverts when balance is below LVL1 threshold (and user is not unlocked)", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("100"));
      await expect(stakeAndRegisterUser(mintPool, user1)).to.be.revertedWith("Below LVL1 threshold");
    });

    it("emits Registered event", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      const balance = ethers.parseEther("5000");
      await token.mint(user1.address, balance);
      await expect(stakeAndRegisterUser(mintPool, user1))
        .to.emit(mintPool, "Registered")
        .withArgs(0, user1.address, balance);
    });

    it("reverts when registering twice in the same epoch", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("5000"));
      await stakeAndRegisterUser(mintPool, user1);
      await expect(stakeAndRegisterUser(mintPool, user1)).to.be.revertedWith("Already registered");
    });

    it("snapshots thresholds on first registration of an epoch", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("5000"));
      await stakeAndRegisterUser(mintPool, user1);
      expect(await mintPool.epochThresholdSnapshotted(0)).to.equal(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPOSIT — split into holder + provider sides
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deposit (holder/provider split)", function () {
    it("accepts deposit from contentContract", async function () {
      const { mintPool, treasury } = await loadFixture(deployMintPool);
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(treasury).depositForPool(0, { value: ethers.parseEther("1") });

      const holder = await mintPool.getEpochHolderDeposits(0);
      const provider = await mintPool.getEpochProviderDeposits(0);
      const expectedProvider = (ethers.parseEther("1") * PROVIDER_SHARE_BPS) / BPS;
      const expectedHolder = ethers.parseEther("1") - expectedProvider;
      expect(holder[0]).to.equal(expectedHolder);
      expect(provider[0]).to.equal(expectedProvider);
    });

    it("accepts deposit from royaltySplitter", async function () {
      const { mintPool, treasury } = await loadFixture(deployMintPool);
      await mintPool.setRoyaltySplitter(treasury.address);
      await mintPool.connect(treasury).depositForPool(2, { value: ethers.parseEther("0.5") });
      const holder = await mintPool.getEpochHolderDeposits(0);
      expect(holder[2]).to.be.gt(0);
    });

    it("accepts deposit from feeHook", async function () {
      const { mintPool, treasury } = await loadFixture(deployMintPool);
      await mintPool.setFeeHook(treasury.address);
      await mintPool.connect(treasury).depositForPool(3, { value: ethers.parseEther("0.3") });
      const holder = await mintPool.getEpochHolderDeposits(0);
      expect(holder[3]).to.be.gt(0);
    });

    it("rejects unauthorized depositor", async function () {
      const { mintPool, user1 } = await loadFixture(deployMintPool);
      await expect(
        mintPool.connect(user1).depositForPool(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Unauthorized depositor");
    });

    it("accumulates deposits across calls", async function () {
      const { mintPool, treasury } = await loadFixture(deployMintPool);
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(treasury).depositForPool(0, { value: ethers.parseEther("1") });
      await mintPool.connect(treasury).depositForPool(0, { value: ethers.parseEther("2") });
      const holder = await mintPool.getEpochHolderDeposits(0);
      const expectedTotal = ethers.parseEther("3");
      const expectedProvider = (expectedTotal * PROVIDER_SHARE_BPS) / BPS;
      expect(holder[0]).to.equal(expectedTotal - expectedProvider);
    });

    it("emits PoolDeposit with both holder + provider amounts", async function () {
      const { mintPool, treasury } = await loadFixture(deployMintPool);
      await mintPool.setContentContract(treasury.address);
      const amount = ethers.parseEther("1");
      const expectedProvider = (amount * PROVIDER_SHARE_BPS) / BPS;
      const expectedHolder = amount - expectedProvider;
      await expect(mintPool.connect(treasury).depositForPool(0, { value: amount }))
        .to.emit(mintPool, "PoolDeposit")
        .withArgs(0, expectedHolder, expectedProvider, treasury.address, 0);
    });

    it("tracks lifetime totalDeposited (holder side) per pool", async function () {
      const { mintPool, treasury } = await loadFixture(deployMintPool);
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(treasury).depositForPool(2, { value: ethers.parseEther("4") });
      const totals = await mintPool.getAllTotalDeposited();
      const expectedHolder = ethers.parseEther("4") - (ethers.parseEther("4") * PROVIDER_SHARE_BPS) / BPS;
      expect(totals[2]).to.equal(expectedHolder);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RECORD MINT (activity gate)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("recordMint (activity gate)", function () {
    it("authorized minter (clone via factory) can record mints", async function () {
      const { mintPool, treasury, user1 } = await loadFixture(deployMintPool);
      await recordMintFor(mintPool, treasury, user1, 0);
      expect(await mintPool.getEpochMints(0, 0, user1.address)).to.equal(1);
    });

    it("rejects recordMint from non-authorized caller (even owner)", async function () {
      const { mintPool, user1 } = await loadFixture(deployMintPool);
      await expect(
        mintPool.connect(user1).recordMint(user1.address, 0)
      ).to.be.revertedWith("Unauthorized recorder");
    });

    it("emits MintRecorded event", async function () {
      const { mintPool, treasury, user1 } = await loadFixture(deployMintPool);
      await expect(recordMintFor(mintPool, treasury, user1, 2))
        .to.emit(mintPool, "MintRecorded")
        .withArgs(0, 2, user1.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIRM CLAIM (Arbitrum-local re-check)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("confirmClaim", function () {
    it("succeeds when balance held since registration", async function () {
      const { mintPool, token, user1, treasury } = await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("5000"));
      await mintPool.setContentContract(treasury.address);
      await stakeAndRegisterUser(mintPool, user1);
      await time.increase(EPOCH_DURATION);
      await expect(confirmUserClaim(mintPool, user1, 0)).to.emit(mintPool, "ClaimConfirmed");
    });

    it("prevents the registered stake from leaving before confirmation", async function () {
      const { mintPool, token, stakingVault, user1 } = await loadFixture(deployMintPool);
      const balance = ethers.parseEther("5000");
      await token.mint(user1.address, balance);
      await stakeAndRegisterUser(mintPool, user1);
      await expect(stakingVault.connect(user1).unstake(balance / 2n)).to.be.revertedWithCustomError(stakingVault, "StakeStillLocked");
      await time.increase(EPOCH_DURATION);
      await expect(confirmUserClaim(mintPool, user1, 0)).to.emit(mintPool, "ClaimConfirmed");
    });

    it("reverts when called outside the claim window", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("5000"));
      await stakeAndRegisterUser(mintPool, user1);
      await time.increase(EPOCH_DURATION);
      await time.increase(EPOCH_DURATION); // skip past the claim window
      await expect(confirmUserClaim(mintPool, user1, 0)).to.be.revertedWith("Claim window closed");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLAIM EPOCH
  // ═══════════════════════════════════════════════════════════════════════════

  describe("claimEpoch", function () {
    it("pays the proportional share to claimer", async function () {
      const { mintPool, user1, depositAmount, user1Amount, user2Amount } = await setupFullClaimFlow();
      const totalRegistered = user1Amount + user2Amount;
      const totalProvider = (depositAmount * PROVIDER_SHARE_BPS) / BPS;
      const holderPool = depositAmount - totalProvider;
      const expectedShare = (holderPool * user1Amount) / totalRegistered;
      await expect(mintPool.connect(user1).claimEpoch(0, 0))
        .to.changeEtherBalance(user1, expectedShare);
    });

    it("reverts if user hasn't minted in the category for that epoch (activity gate)", async function () {
      const { mintPool, token, user1, user3, treasury } = await loadFixture(deployMintPool);
      // user3 holds tokens, registers, but never mints. Should not be able to claim.
      await token.mint(user3.address, ethers.parseEther("50000"));
      await mintPool.setContentContract(treasury.address);
      await stakeAndRegisterUser(mintPool, user3);
      await mintPool.connect(treasury).depositForPool(0, { value: ethers.parseEther("1") });
      await time.increase(EPOCH_DURATION);
      await confirmUserClaim(mintPool, user3, 0);
      await mine(MIN_CLAIM_BLOCK_GAP);
      await expect(mintPool.connect(user3).claimEpoch(0, 0))
        .to.be.revertedWith("No mints in this category for epoch");
    });

    it("reverts when no deposits in target pool", async function () {
      // Custom flow: register, deposit only in pool 0, mint in pool 5,
      // then attempt claim on pool 5 (no deposits exist there).
      const { mintPool, token, user1, treasury } = await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("50000"));
      await mintPool.setContentContract(treasury.address);
      await stakeAndRegisterUser(mintPool, user1);
      await mintPool.connect(treasury).depositForPool(0, { value: ethers.parseEther("1") });
      await recordMintFor(mintPool, treasury, user1, 5); // activity gate satisfied for pool 5
      await time.increase(EPOCH_DURATION);
      await confirmUserClaim(mintPool, user1, 0);
      await mine(MIN_CLAIM_BLOCK_GAP);
      await expect(mintPool.connect(user1).claimEpoch(0, 5))
        .to.be.revertedWith("No deposits in this pool");
    });

    it("emits EpochClaimed event", async function () {
      const { mintPool, user1 } = await setupFullClaimFlow();
      await expect(mintPool.connect(user1).claimEpoch(0, 0)).to.emit(mintPool, "EpochClaimed");
    });

    it("updates totalClaimed", async function () {
      const { mintPool, user1, depositAmount, user1Amount, user2Amount } = await setupFullClaimFlow();
      const totalRegistered = user1Amount + user2Amount;
      const totalProvider = (depositAmount * PROVIDER_SHARE_BPS) / BPS;
      const holderPool = depositAmount - totalProvider;
      const expectedShare = (holderPool * user1Amount) / totalRegistered;
      await mintPool.connect(user1).claimEpoch(0, 0);
      expect(await mintPool.totalClaimed()).to.equal(expectedShare);
    });

    it("rejects double-claim", async function () {
      const { mintPool, user1 } = await setupFullClaimFlow();
      await mintPool.connect(user1).claimEpoch(0, 0);
      await expect(mintPool.connect(user1).claimEpoch(0, 0)).to.be.revertedWith("Already claimed");
    });

    it("rejects claim before 256-block gap", async function () {
      const { mintPool, token, user1, treasury } = await loadFixture(deployMintPool);
      const balance = ethers.parseEther("5000");
      await token.mint(user1.address, balance);
      await mintPool.setContentContract(treasury.address);
      await stakeAndRegisterUser(mintPool, user1);
      await mintPool.connect(treasury).depositForPool(0, { value: ethers.parseEther("1") });
      await recordMintFor(mintPool, treasury, user1, 0);
      await time.increase(EPOCH_DURATION);
      await confirmUserClaim(mintPool, user1, 0);
      // Don't mine 256 blocks
      await expect(mintPool.connect(user1).claimEpoch(0, 0)).to.be.revertedWith("Must wait 256 blocks after confirmClaim");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLAIM EPOCH BATCH
  // ═══════════════════════════════════════════════════════════════════════════

  describe("claimEpochBatch", function () {
    it("claims from multiple pools (where user qualifies + has minted)", async function () {
      const { mintPool, token, user1, treasury } = await loadFixture(deployMintPool);
      const balance = ethers.parseEther("50000");
      await token.mint(user1.address, balance);
      await mintPool.setContentContract(treasury.address);
      await stakeAndRegisterUser(mintPool, user1);
      // Deposit in two pools
      await mintPool.connect(treasury).depositForPool(0, { value: ethers.parseEther("1") });
      await mintPool.connect(treasury).depositForPool(2, { value: ethers.parseEther("2") });
      // Activity recorded in both
      await recordMintFor(mintPool, treasury, user1, 0);
      await recordMintFor(mintPool, treasury, user1, 2);
      await time.increase(EPOCH_DURATION);
      await confirmUserClaim(mintPool, user1, 0);
      await mine(MIN_CLAIM_BLOCK_GAP);

      const totalProvider0 = (ethers.parseEther("1") * PROVIDER_SHARE_BPS) / BPS;
      const totalProvider2 = (ethers.parseEther("2") * PROVIDER_SHARE_BPS) / BPS;
      const holderShare0 = ethers.parseEther("1") - totalProvider0;
      const holderShare2 = ethers.parseEther("2") - totalProvider2;
      const expected = holderShare0 + holderShare2;

      await expect(mintPool.connect(user1).claimEpochBatch(0, [0, 2]))
        .to.changeEtherBalance(user1, expected);
    });

    it("skips pools where user has no mints in category", async function () {
      const { mintPool, token, user1, treasury } = await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("50000"));
      await mintPool.setContentContract(treasury.address);
      await stakeAndRegisterUser(mintPool, user1);
      await mintPool.connect(treasury).depositForPool(0, { value: ethers.parseEther("1") });
      await mintPool.connect(treasury).depositForPool(2, { value: ethers.parseEther("2") });
      // Only mint in pool 0 — pool 2 should be skipped
      await recordMintFor(mintPool, treasury, user1, 0);
      await time.increase(EPOCH_DURATION);
      await confirmUserClaim(mintPool, user1, 0);
      await mine(MIN_CLAIM_BLOCK_GAP);

      const expectedHolder = ethers.parseEther("1") - (ethers.parseEther("1") * PROVIDER_SHARE_BPS) / BPS;
      await expect(mintPool.connect(user1).claimEpochBatch(0, [0, 2]))
        .to.changeEtherBalance(user1, expectedHolder);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROVIDER WITHDRAW (only ServiceTime)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("withdrawProviderShare (ServiceTime only)", function () {
    it("rejects calls from non-ServiceTime", async function () {
      const { mintPool, user1 } = await loadFixture(deployMintPool);
      await expect(
        mintPool.connect(user1).withdrawProviderShare(0, 0, user1.address, 100, 100)
      ).to.be.revertedWith("Only ServiceTime");
    });

    it("transfers provider's weighted share when called by ServiceTime", async function () {
      const { mintPool, treasury, user1, user3 } = await loadFixture(deployMintPool);
      // user3 = mock service-time contract for the test
      await mintPool.setServiceTimeContract(user3.address);
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(treasury).depositForPool(1, { value: ethers.parseEther("2") });

      await time.increase(EPOCH_DURATION);
      const totalProvider = (ethers.parseEther("2") * PROVIDER_SHARE_BPS) / BPS;
      // user1 provides 60% of total time
      const providerTime = 600;
      const totalTime = 1000;
      const expected = (totalProvider * BigInt(providerTime)) / BigInt(totalTime);

      await expect(
        mintPool.connect(user3).withdrawProviderShare(0, 1, user1.address, providerTime, totalTime)
      ).to.changeEtherBalance(user1, expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEWS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Views", function () {
    it("getEpochHolderDeposits returns zeros for an empty epoch", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      const arr = await mintPool.getEpochHolderDeposits(99);
      for (let i = 0; i < NUM_POOLS; i++) expect(arr[i]).to.equal(0);
    });

    it("getEpochProviderDeposits returns zeros for an empty epoch", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      const arr = await mintPool.getEpochProviderDeposits(99);
      for (let i = 0; i < NUM_POOLS; i++) expect(arr[i]).to.equal(0);
    });

    it("previewHolderClaim returns expected amount for finalized epoch", async function () {
      const { mintPool, user1, depositAmount, user1Amount, user2Amount } = await setupFullClaimFlow();
      const totalRegistered = user1Amount + user2Amount;
      const totalProvider = (depositAmount * PROVIDER_SHARE_BPS) / BPS;
      const holderPool = depositAmount - totalProvider;
      const expected = (holderPool * user1Amount) / totalRegistered;
      expect(await mintPool.previewHolderClaim(0, 0, user1.address)).to.equal(expected);
    });

    it("previewHolderClaim returns 0 if user has no mints in the category", async function () {
      const { mintPool, token, user3, treasury } = await loadFixture(deployMintPool);
      await token.mint(user3.address, ethers.parseEther("50000"));
      await mintPool.setContentContract(treasury.address);
      await stakeAndRegisterUser(mintPool, user3);
      await mintPool.connect(treasury).depositForPool(0, { value: ethers.parseEther("1") });
      await time.increase(EPOCH_DURATION);
      // user3 never minted — preview should be 0 even though they registered
      expect(await mintPool.previewHolderClaim(0, 0, user3.address)).to.equal(0);
    });

    it("previewHolderClaim returns 0 for non-finalized epoch", async function () {
      const { mintPool, user1 } = await setupFullClaimFlow();
      // Current epoch hasn't ended yet (we're in epoch 1, claim was for epoch 0 — so epoch 1 returns 0)
      expect(await mintPool.previewHolderClaim(1, 0, user1.address)).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SWEEP / RECIRCULATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Sweep + recirculate", function () {
    it("sweepUnclaimed sends only the unclaimed remainder to treasury", async function () {
      const { mintPool, user1, treasury, depositAmount, user1Amount, user2Amount } = await setupFullClaimFlow();
      // user1 claims their share
      await mintPool.connect(user1).claimEpoch(0, 0);
      // Advance to claim window+1
      await time.increase(EPOCH_DURATION);

      const totalRegistered = user1Amount + user2Amount;
      const totalProvider = (depositAmount * PROVIDER_SHARE_BPS) / BPS;
      const holderPool = depositAmount - totalProvider;
      const user1Share = (holderPool * user1Amount) / totalRegistered;
      const remaining = depositAmount - user1Share; // unclaimed holder share + full provider side

      await expect(mintPool.sweepUnclaimed(0))
        .to.changeEtherBalance(treasury, remaining);
    });

    it("recirculateUnclaimed moves unclaimed funds to current epoch", async function () {
      const { mintPool, user1, depositAmount, user1Amount, user2Amount } = await setupFullClaimFlow();
      await mintPool.connect(user1).claimEpoch(0, 0);
      await time.increase(EPOCH_DURATION);

      const totalRegistered = user1Amount + user2Amount;
      const totalProvider = (depositAmount * PROVIDER_SHARE_BPS) / BPS;
      const holderPool = depositAmount - totalProvider;
      const user1Share = (holderPool * user1Amount) / totalRegistered;
      const unclaimedHolder = holderPool - user1Share;

      await mintPool.recirculateUnclaimed(0);
      const currentEpoch = await mintPool.currentEpoch();
      const recirculated = await mintPool.getEpochHolderDeposits(currentEpoch);
      expect(recirculated[0]).to.equal(unclaimedHolder);
    });
  });
});
