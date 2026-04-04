const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { time, mine } = require("@nomicfoundation/hardhat-network-helpers");
const {
  EPOCH_DURATION,
  POOL_THRESHOLDS,
  POOL_THRESHOLDS_WEI,
  MIN_CLAIM_BLOCK_GAP,
  NUM_POOLS,
  DEAD_ADDRESS,
} = require("./helpers/constants");
const { deployMintPool } = require("./helpers/deploy");

describe("BonzaiMintPool", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Full claim flow helper:
   * 1. Mint tokens to user
   * 2. Set authorized depositor (contentContract)
   * 3. Register in current epoch
   * 4. Deposit ETH to pool
   * 5. Advance to next epoch
   * 6. confirmClaim
   * 7. Mine 256 blocks
   * Returns all objects for further assertions.
   */
  async function setupFullClaimFlow() {
    const { mintPool, token, companionNFT, owner, user1, user2, user3, treasury } =
      await loadFixture(deployMintPool);

    const poolAddress = await mintPool.getAddress();

    // Mint LVL5 tokens (50K) to user1, LVL1 tokens (1K) to user2
    const user1Amount = ethers.parseEther("50000");
    const user2Amount = ethers.parseEther("1000");
    await token.mint(user1.address, user1Amount);
    await token.mint(user2.address, user2Amount);

    // Mint companion NFTs (required for claiming)
    await companionNFT.mintTo(user1.address);
    await companionNFT.mintTo(user2.address);

    // Set treasury as the contentContract (authorized depositor)
    await mintPool.setContentContract(treasury.address);

    // Register in epoch 0
    await mintPool.connect(user1).registerForEpoch();
    await mintPool.connect(user2).registerForEpoch();

    // Deposit 10 ETH to pool 0 (text) as contentContract
    const depositAmount = ethers.parseEther("10");
    await mintPool
      .connect(treasury)
      .depositForPool(0, { value: depositAmount });

    // Advance to epoch 1
    await time.increase(EPOCH_DURATION);

    // confirmClaim for epoch 0
    await mintPool.connect(user1).confirmClaim(0);
    await mintPool.connect(user2).confirmClaim(0);

    // Mine 256 blocks for flash loan protection
    await mine(MIN_CLAIM_BLOCK_GAP);

    return {
      mintPool,
      token,
      companionNFT,
      owner,
      user1,
      user2,
      user3,
      treasury,
      poolAddress,
      user1Amount,
      user2Amount,
      depositAmount,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("should set correct initial state", async function () {
      const { mintPool, token } = await loadFixture(deployMintPool);

      expect(await mintPool.bonzaiToken()).to.equal(await token.getAddress());
      expect(await mintPool.epochDuration()).to.equal(EPOCH_DURATION);
      expect(await mintPool.currentEpoch()).to.equal(0);

      const thresholds = await mintPool.getAllPoolThresholds();
      for (let i = 0; i < NUM_POOLS; i++) {
        expect(thresholds[i]).to.equal(POOL_THRESHOLDS_WEI[i]);
      }
    });

    it("should reject zero address for token", async function () {
      const [, , , , treasury] = await ethers.getSigners();
      const BonzaiMintPool = await ethers.getContractFactory("BonzaiMintPool");
      await expect(
        BonzaiMintPool.deploy(ethers.ZeroAddress, POOL_THRESHOLDS, EPOCH_DURATION, treasury.address)
      ).to.be.revertedWith("Invalid token address");
    });

    it("should reject zero epoch duration", async function () {
      const [, , , , treasury] = await ethers.getSigners();
      const token = await (
        await ethers.getContractFactory("MockERC20")
      ).deploy("BONZAI", "BONZAI");
      const BonzaiMintPool = await ethers.getContractFactory("BonzaiMintPool");
      await expect(
        BonzaiMintPool.deploy(await token.getAddress(), POOL_THRESHOLDS, 0, treasury.address)
      ).to.be.revertedWith("Invalid epoch duration");
    });

    it("should reject non-ascending thresholds", async function () {
      const [, , , , treasury] = await ethers.getSigners();
      const token = await (
        await ethers.getContractFactory("MockERC20")
      ).deploy("BONZAI", "BONZAI");
      const BonzaiMintPool = await ethers.getContractFactory("BonzaiMintPool");
      const badThresholds = [1000, 5000, 3000, 25000, 33000, 50000]; // 3000 < 5000
      await expect(
        BonzaiMintPool.deploy(
          await token.getAddress(),
          badThresholds,
          EPOCH_DURATION,
          treasury.address
        )
      ).to.be.revertedWith("Thresholds must be ascending");
    });

    it("should reject zero threshold", async function () {
      const [, , , , treasury] = await ethers.getSigners();
      const token = await (
        await ethers.getContractFactory("MockERC20")
      ).deploy("BONZAI", "BONZAI");
      const BonzaiMintPool = await ethers.getContractFactory("BonzaiMintPool");
      const badThresholds = [0, 5000, 10000, 25000, 33000, 50000];
      await expect(
        BonzaiMintPool.deploy(
          await token.getAddress(),
          badThresholds,
          EPOCH_DURATION,
          treasury.address
        )
      ).to.be.revertedWith("Threshold cannot be zero");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EPOCHS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Epochs", function () {
    it("should return epoch 0 at deployment", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      expect(await mintPool.currentEpoch()).to.equal(0);
    });

    it("should advance to epoch 1 after one epoch duration", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      await time.increase(EPOCH_DURATION);
      expect(await mintPool.currentEpoch()).to.equal(1);
    });

    it("should advance to epoch 3 after three epoch durations", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      await time.increase(EPOCH_DURATION * 3);
      expect(await mintPool.currentEpoch()).to.equal(3);
    });

    it("should compute correct start and end times", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      const genesis = await mintPool.genesisTime();

      const start0 = await mintPool.epochStartTime(0);
      const end0 = await mintPool.epochEndTime(0);
      expect(start0).to.equal(genesis);
      expect(end0).to.equal(genesis + BigInt(EPOCH_DURATION));

      const start2 = await mintPool.epochStartTime(2);
      const end2 = await mintPool.epochEndTime(2);
      expect(start2).to.equal(genesis + BigInt(EPOCH_DURATION) * 2n);
      expect(end2).to.equal(genesis + BigInt(EPOCH_DURATION) * 3n);
    });

    it("should report epoch 0 as not finalized at deployment", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      expect(await mintPool.isEpochFinalized(0)).to.equal(false);
    });

    it("should report epoch 0 as finalized after one epoch", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      await time.increase(EPOCH_DURATION);
      expect(await mintPool.isEpochFinalized(0)).to.equal(true);
    });

    it("should return correct getEpochInfo", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      const genesis = await mintPool.genesisTime();

      const [startTime, endTime, totalRegistered, finalized] =
        await mintPool.getEpochInfo(0);
      expect(startTime).to.equal(genesis);
      expect(endTime).to.equal(genesis + BigInt(EPOCH_DURATION));
      expect(totalRegistered).to.equal(0);
      expect(finalized).to.equal(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("registerForEpoch", function () {
    it("should register user with sufficient balance", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      await token.mint(user1.address, POOL_THRESHOLDS_WEI[0]);
      await mintPool.connect(user1).registerForEpoch();

      expect(await mintPool.isRegistered(0, user1.address)).to.equal(true);
      expect(
        await mintPool.registeredBalances(0, user1.address)
      ).to.equal(POOL_THRESHOLDS_WEI[0]);
    });

    it("should lock user's full BONZAI balance at registration time", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      const amount = ethers.parseEther("25000");
      await token.mint(user1.address, amount);
      await mintPool.connect(user1).registerForEpoch();

      expect(await mintPool.registeredBalances(0, user1.address)).to.equal(
        amount
      );
    });

    it("should accumulate totalRegistered across multiple users", async function () {
      const { mintPool, token, user1, user2 } =
        await loadFixture(deployMintPool);
      const amount1 = ethers.parseEther("10000");
      const amount2 = ethers.parseEther("20000");
      await token.mint(user1.address, amount1);
      await token.mint(user2.address, amount2);

      await mintPool.connect(user1).registerForEpoch();
      await mintPool.connect(user2).registerForEpoch();

      const [, , totalRegistered] = await mintPool.getEpochInfo(0);
      expect(totalRegistered).to.equal(amount1 + amount2);
    });

    it("should reject duplicate registration in same epoch", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      await token.mint(user1.address, POOL_THRESHOLDS_WEI[0]);
      await mintPool.connect(user1).registerForEpoch();

      await expect(
        mintPool.connect(user1).registerForEpoch()
      ).to.be.revertedWith("Already registered");
    });

    it("should reject registration below minimum threshold", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      // 999 BONZAI is below the 1000 minimum
      await token.mint(user1.address, ethers.parseEther("999"));
      await expect(
        mintPool.connect(user1).registerForEpoch()
      ).to.be.revertedWith("Below minimum threshold");
    });

    it("should allow registration in a new epoch after previous registration", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      await token.mint(user1.address, POOL_THRESHOLDS_WEI[0]);

      await mintPool.connect(user1).registerForEpoch(); // epoch 0
      await time.increase(EPOCH_DURATION);
      await mintPool.connect(user1).registerForEpoch(); // epoch 1

      expect(await mintPool.isRegistered(0, user1.address)).to.equal(true);
      expect(await mintPool.isRegistered(1, user1.address)).to.equal(true);
    });

    it("should emit Registered event", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      const amount = ethers.parseEther("5000");
      await token.mint(user1.address, amount);

      await expect(mintPool.connect(user1).registerForEpoch())
        .to.emit(mintPool, "Registered")
        .withArgs(0, user1.address, amount);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPOSIT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("depositForPool", function () {
    it("should accept deposit from contentContract", async function () {
      const { mintPool, owner, treasury } = await loadFixture(deployMintPool);
      await mintPool.setContentContract(treasury.address);

      const amount = ethers.parseEther("1");
      await mintPool.connect(treasury).depositForPool(0, { value: amount });

      const deposits = await mintPool.getEpochDeposits(0);
      expect(deposits[0]).to.equal(amount);
    });

    it("should accept deposit from royaltySplitter", async function () {
      const { mintPool, owner, treasury } = await loadFixture(deployMintPool);
      await mintPool.setRoyaltySplitter(treasury.address);

      const amount = ethers.parseEther("2");
      await mintPool.connect(treasury).depositForPool(1, { value: amount });

      const deposits = await mintPool.getEpochDeposits(0);
      expect(deposits[1]).to.equal(amount);
    });

    it("should accept deposit from feeHook", async function () {
      const { mintPool, owner, treasury } = await loadFixture(deployMintPool);
      await mintPool.setFeeHook(treasury.address);

      const amount = ethers.parseEther("0.5");
      await mintPool.connect(treasury).depositForPool(2, { value: amount });

      const deposits = await mintPool.getEpochDeposits(0);
      expect(deposits[2]).to.equal(amount);
    });

    it("should reject deposit from unauthorized address", async function () {
      const { mintPool, user1 } = await loadFixture(deployMintPool);
      await expect(
        mintPool.connect(user1).depositForPool(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Unauthorized depositor");
    });

    it("should reject deposit with invalid pool index", async function () {
      const { mintPool, treasury } = await loadFixture(deployMintPool);
      await mintPool.setContentContract(treasury.address);

      await expect(
        mintPool.connect(treasury).depositForPool(6, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Invalid pool index");
    });

    it("should reject zero deposit", async function () {
      const { mintPool, treasury } = await loadFixture(deployMintPool);
      await mintPool.setContentContract(treasury.address);

      await expect(
        mintPool.connect(treasury).depositForPool(0, { value: 0 })
      ).to.be.revertedWith("Zero deposit");
    });

    it("should accumulate deposits across multiple calls", async function () {
      const { mintPool, treasury } = await loadFixture(deployMintPool);
      await mintPool.setContentContract(treasury.address);

      const amount1 = ethers.parseEther("1");
      const amount2 = ethers.parseEther("2");
      await mintPool.connect(treasury).depositForPool(0, { value: amount1 });
      await mintPool.connect(treasury).depositForPool(0, { value: amount2 });

      const deposits = await mintPool.getEpochDeposits(0);
      expect(deposits[0]).to.equal(amount1 + amount2);
    });

    it("should track lifetime totalDeposited", async function () {
      const { mintPool, treasury } = await loadFixture(deployMintPool);
      await mintPool.setContentContract(treasury.address);

      const amount = ethers.parseEther("5");
      await mintPool.connect(treasury).depositForPool(0, { value: amount });

      const totals = await mintPool.getAllTotalDeposited();
      expect(totals[0]).to.equal(amount);
    });

    it("should emit PoolDeposit event", async function () {
      const { mintPool, treasury } = await loadFixture(deployMintPool);
      await mintPool.setContentContract(treasury.address);

      const amount = ethers.parseEther("1");
      await expect(
        mintPool.connect(treasury).depositForPool(3, { value: amount })
      )
        .to.emit(mintPool, "PoolDeposit")
        .withArgs(3, amount, treasury.address, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIRM CLAIM
  // ═══════════════════════════════════════════════════════════════════════════

  describe("confirmClaim", function () {
    it("should confirm claim for registered user in epoch N+1", async function () {
      const { mintPool, token, companionNFT, user1, treasury } =
        await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("10000"));
      await companionNFT.mintTo(user1.address);
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();
      await mintPool
        .connect(treasury)
        .depositForPool(0, { value: ethers.parseEther("1") });

      await time.increase(EPOCH_DURATION);

      await expect(mintPool.connect(user1).confirmClaim(0))
        .to.emit(mintPool, "ClaimConfirmed");
    });

    it("should reject confirmClaim for non-finalized epoch", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("10000"));
      await mintPool.connect(user1).registerForEpoch();

      await expect(
        mintPool.connect(user1).confirmClaim(0)
      ).to.be.revertedWith("Epoch not ended yet");
    });

    it("should reject confirmClaim when claim window is closed (epoch N+2)", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("10000"));
      await mintPool.connect(user1).registerForEpoch();

      // Advance 2 epochs so we are in epoch 2, window for epoch 0 is closed
      await time.increase(EPOCH_DURATION * 2);

      await expect(
        mintPool.connect(user1).confirmClaim(0)
      ).to.be.revertedWith("Claim window closed");
    });

    it("should reject confirmClaim without companion NFT", async function () {
      const { mintPool, token, user1, treasury } = await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("10000"));
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();

      await time.increase(EPOCH_DURATION);

      await expect(
        mintPool.connect(user1).confirmClaim(0)
      ).to.be.revertedWith("Must own a companion");
    });

    it("should reject confirmClaim for unregistered user", async function () {
      const { mintPool, companionNFT, user1 } = await loadFixture(deployMintPool);
      await companionNFT.mintTo(user1.address);
      await time.increase(EPOCH_DURATION);

      await expect(
        mintPool.connect(user1).confirmClaim(0)
      ).to.be.revertedWith("Not registered for this epoch");
    });

    it("should reject confirmClaim if balance dropped below registered amount", async function () {
      const { mintPool, token, companionNFT, user1 } = await loadFixture(deployMintPool);
      const amount = ethers.parseEther("10000");
      await token.mint(user1.address, amount);
      await companionNFT.mintTo(user1.address);
      await mintPool.connect(user1).registerForEpoch();

      // Transfer tokens away before confirming
      await token.connect(user1).transfer(DEAD_ADDRESS, amount);

      await time.increase(EPOCH_DURATION);

      await expect(
        mintPool.connect(user1).confirmClaim(0)
      ).to.be.revertedWith("Balance dropped below registered amount");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLAIM EPOCH
  // ═══════════════════════════════════════════════════════════════════════════

  describe("claimEpoch", function () {
    it("should pay proportional share to claimer", async function () {
      const {
        mintPool,
        user1,
        user1Amount,
        user2Amount,
        depositAmount,
      } = await setupFullClaimFlow();

      // user1 has 50000 tokens, user2 has 1000 tokens, total registered = 51000
      // user1's share of pool 0 = 10 ETH * 50000/51000
      const expectedAmount =
        (depositAmount * user1Amount) / (user1Amount + user2Amount);

      const balanceBefore = await ethers.provider.getBalance(user1.address);
      const tx = await mintPool.connect(user1).claimEpoch(0, 0);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(user1.address);

      expect(balanceAfter - balanceBefore + gasUsed).to.equal(expectedAmount);
    });

    it("should mark pool as claimed after successful claim", async function () {
      const { mintPool, user1 } = await setupFullClaimFlow();
      await mintPool.connect(user1).claimEpoch(0, 0);

      expect(
        await mintPool.hasClaimedEpoch(0, user1.address, 0)
      ).to.equal(true);
    });

    it("should reject double claim for same pool", async function () {
      const { mintPool, user1 } = await setupFullClaimFlow();
      await mintPool.connect(user1).claimEpoch(0, 0);

      await expect(
        mintPool.connect(user1).claimEpoch(0, 0)
      ).to.be.revertedWith("Already claimed");
    });

    it("should reject claim without confirmClaim", async function () {
      const { mintPool, token, owner, user1, treasury } =
        await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("50000"));
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();
      await mintPool
        .connect(treasury)
        .depositForPool(0, { value: ethers.parseEther("10") });

      await time.increase(EPOCH_DURATION);
      // Skip confirmClaim, try to claim directly
      await mine(MIN_CLAIM_BLOCK_GAP);

      await expect(
        mintPool.connect(user1).claimEpoch(0, 0)
      ).to.be.revertedWith("Must call confirmClaim first");
    });

    it("should reject claim before 256 blocks after confirmClaim", async function () {
      const { mintPool, token, companionNFT, user1, treasury } =
        await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("50000"));
      await companionNFT.mintTo(user1.address);
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();
      await mintPool
        .connect(treasury)
        .depositForPool(0, { value: ethers.parseEther("10") });

      await time.increase(EPOCH_DURATION);
      await mintPool.connect(user1).confirmClaim(0);
      // Only mine 100 blocks, not enough
      await mine(100);

      await expect(
        mintPool.connect(user1).claimEpoch(0, 0)
      ).to.be.revertedWith("Must wait 256 blocks after confirmClaim");
    });

    it("should reject claim below pool threshold", async function () {
      const { mintPool, user2 } = await setupFullClaimFlow();
      // user2 has 1000 BONZAI = LVL1 only, pool 1 requires 5000
      await expect(
        mintPool.connect(user2).claimEpoch(0, 1)
      ).to.be.revertedWith("Below pool threshold");
    });

    it("should reject claim if balance dropped after registration", async function () {
      const { mintPool, token, companionNFT, user1, treasury } =
        await loadFixture(deployMintPool);
      const amount = ethers.parseEther("50000");
      await token.mint(user1.address, amount);
      await companionNFT.mintTo(user1.address);
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();
      await mintPool
        .connect(treasury)
        .depositForPool(0, { value: ethers.parseEther("10") });

      await time.increase(EPOCH_DURATION);
      await mintPool.connect(user1).confirmClaim(0);
      await mine(MIN_CLAIM_BLOCK_GAP);

      // Burn tokens after confirmClaim but before claimEpoch
      await token.burn(user1.address, amount);

      await expect(
        mintPool.connect(user1).claimEpoch(0, 0)
      ).to.be.revertedWith("Balance dropped below registered amount");
    });

    it("should reject claim when epoch has no deposits in pool", async function () {
      const { mintPool, token, companionNFT, user1, treasury } =
        await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("50000"));
      await companionNFT.mintTo(user1.address);
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();
      // Deposit to pool 0 but NOT to pool 1
      await mintPool
        .connect(treasury)
        .depositForPool(0, { value: ethers.parseEther("10") });

      await time.increase(EPOCH_DURATION);
      await mintPool.connect(user1).confirmClaim(0);
      await mine(MIN_CLAIM_BLOCK_GAP);

      await expect(
        mintPool.connect(user1).claimEpoch(0, 1)
      ).to.be.revertedWith("No deposits in this pool");
    });

    it("should reject claim for non-finalized epoch", async function () {
      const { mintPool, token, user1, treasury } =
        await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("50000"));
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();

      // Don't advance time, epoch 0 is still active
      await expect(
        mintPool.connect(user1).claimEpoch(0, 0)
      ).to.be.revertedWith("Epoch not ended yet");
    });

    it("should reject claim when claim window is closed (epoch N+2)", async function () {
      const { mintPool, token, companionNFT, user1, treasury } =
        await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("50000"));
      await companionNFT.mintTo(user1.address);
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();
      await mintPool
        .connect(treasury)
        .depositForPool(0, { value: ethers.parseEther("10") });

      // Advance to epoch 1 and confirm
      await time.increase(EPOCH_DURATION);
      await mintPool.connect(user1).confirmClaim(0);
      await mine(MIN_CLAIM_BLOCK_GAP);

      // Advance to epoch 2 => claim window for epoch 0 is closed
      await time.increase(EPOCH_DURATION);

      await expect(
        mintPool.connect(user1).claimEpoch(0, 0)
      ).to.be.revertedWith("Claim window closed");
    });

    it("should reject claim with invalid pool index", async function () {
      const { mintPool, user1 } = await setupFullClaimFlow();
      await expect(
        mintPool.connect(user1).claimEpoch(0, 6)
      ).to.be.revertedWith("Invalid pool index");
    });

    it("should emit EpochClaimed event", async function () {
      const { mintPool, user1, user1Amount, user2Amount, depositAmount } =
        await setupFullClaimFlow();

      const expectedAmount =
        (depositAmount * user1Amount) / (user1Amount + user2Amount);

      await expect(mintPool.connect(user1).claimEpoch(0, 0))
        .to.emit(mintPool, "EpochClaimed")
        .withArgs(0, 0, user1.address, expectedAmount);
    });

    it("should update totalClaimed after claim", async function () {
      const { mintPool, user1, user1Amount, user2Amount, depositAmount } =
        await setupFullClaimFlow();

      await mintPool.connect(user1).claimEpoch(0, 0);

      const expectedAmount =
        (depositAmount * user1Amount) / (user1Amount + user2Amount);
      expect(await mintPool.totalClaimed()).to.equal(expectedAmount);
    });

    it("should reject claim when paused", async function () {
      const { mintPool, owner, user1 } = await setupFullClaimFlow();
      await mintPool.connect(owner).pause();

      await expect(
        mintPool.connect(user1).claimEpoch(0, 0)
      ).to.be.revertedWithCustomError(mintPool, "EnforcedPause");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLAIM EPOCH BATCH
  // ═══════════════════════════════════════════════════════════════════════════

  describe("claimEpochBatch", function () {
    it("should claim from multiple pools in one transaction", async function () {
      const { mintPool, token, companionNFT, user1, treasury } =
        await loadFixture(deployMintPool);
      const amount = ethers.parseEther("50000"); // LVL5
      await token.mint(user1.address, amount);
      await companionNFT.mintTo(user1.address);
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();

      // Deposit to pools 0 and 1
      const dep0 = ethers.parseEther("5");
      const dep1 = ethers.parseEther("3");
      await mintPool.connect(treasury).depositForPool(0, { value: dep0 });
      await mintPool.connect(treasury).depositForPool(1, { value: dep1 });

      await time.increase(EPOCH_DURATION);
      await mintPool.connect(user1).confirmClaim(0);
      await mine(MIN_CLAIM_BLOCK_GAP);

      // Single user => 100% share for both pools
      const expectedTotal = dep0 + dep1;

      const balanceBefore = await ethers.provider.getBalance(user1.address);
      const tx = await mintPool.connect(user1).claimEpochBatch(0, [0, 1]);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(user1.address);

      expect(balanceAfter - balanceBefore + gasUsed).to.equal(expectedTotal);
      expect(await mintPool.hasClaimedEpoch(0, user1.address, 0)).to.equal(true);
      expect(await mintPool.hasClaimedEpoch(0, user1.address, 1)).to.equal(true);
    });

    it("should skip pools where user is below threshold in batch", async function () {
      const { mintPool, token, companionNFT, user1, treasury } =
        await loadFixture(deployMintPool);
      // 1000 BONZAI = LVL1 only, qualifies for pool 0 but not pool 1 (5000)
      const amount = ethers.parseEther("1000");
      await token.mint(user1.address, amount);
      await companionNFT.mintTo(user1.address);
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();

      await mintPool
        .connect(treasury)
        .depositForPool(0, { value: ethers.parseEther("5") });
      await mintPool
        .connect(treasury)
        .depositForPool(1, { value: ethers.parseEther("3") });

      await time.increase(EPOCH_DURATION);
      await mintPool.connect(user1).confirmClaim(0);
      await mine(MIN_CLAIM_BLOCK_GAP);

      // Batch claim pools 0 and 1; pool 1 should be skipped
      const tx = await mintPool.connect(user1).claimEpochBatch(0, [0, 1]);
      await tx.wait();

      expect(await mintPool.hasClaimedEpoch(0, user1.address, 0)).to.equal(true);
      // Pool 1 skipped because balance < threshold
      expect(await mintPool.hasClaimedEpoch(0, user1.address, 1)).to.equal(false);
    });

    it("should revert batch if nothing to claim", async function () {
      const { mintPool, token, companionNFT, user1, treasury } =
        await loadFixture(deployMintPool);
      const amount = ethers.parseEther("50000");
      await token.mint(user1.address, amount);
      await companionNFT.mintTo(user1.address);
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();
      // No deposits at all

      await time.increase(EPOCH_DURATION);
      await mintPool.connect(user1).confirmClaim(0);
      await mine(MIN_CLAIM_BLOCK_GAP);

      await expect(
        mintPool.connect(user1).claimEpochBatch(0, [0, 1])
      ).to.be.revertedWith("Nothing to claim");
    });

    it("should reject batch claim when paused", async function () {
      const { mintPool, owner, user1 } = await setupFullClaimFlow();
      await mintPool.connect(owner).pause();

      await expect(
        mintPool.connect(user1).claimEpochBatch(0, [0])
      ).to.be.revertedWithCustomError(mintPool, "EnforcedPause");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SWEEP UNCLAIMED
  // ═══════════════════════════════════════════════════════════════════════════

  describe("sweepUnclaimed", function () {
    it("should sweep unclaimed ETH to treasury after claim window closes", async function () {
      const { mintPool, token, user1, owner, treasury } =
        await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("50000"));
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();

      const deposit = ethers.parseEther("10");
      await mintPool.connect(treasury).depositForPool(0, { value: deposit });

      // Advance 2 epochs: epoch 0 finalized, claim window (epoch 1) closed
      await time.increase(EPOCH_DURATION * 2);

      const treasuryBalBefore = await ethers.provider.getBalance(treasury.address);
      await mintPool.connect(owner).sweepUnclaimed(0);
      const treasuryBalAfter = await ethers.provider.getBalance(treasury.address);

      // All 10 ETH unclaimed should be swept to treasury
      expect(treasuryBalAfter - treasuryBalBefore).to.equal(deposit);
    });

    it("should sweep only unclaimed portion to treasury after partial claims", async function () {
      const { mintPool, user1, user1Amount, user2Amount, depositAmount, owner, treasury } =
        await setupFullClaimFlow();

      // user1 claims pool 0
      await mintPool.connect(user1).claimEpoch(0, 0);
      const user1Share =
        (depositAmount * user1Amount) / (user1Amount + user2Amount);

      // Advance to epoch 2 so sweep is allowed
      await time.increase(EPOCH_DURATION);

      const treasuryBalBefore = await ethers.provider.getBalance(treasury.address);
      await mintPool.connect(owner).sweepUnclaimed(0);
      const treasuryBalAfter = await ethers.provider.getBalance(treasury.address);

      // Unclaimed = total deposited - user1's claimed amount
      const expectedSweep = depositAmount - user1Share;
      expect(treasuryBalAfter - treasuryBalBefore).to.equal(expectedSweep);
    });

    it("should reject sweep before claim window closes", async function () {
      const { mintPool, token, user1, owner, treasury } =
        await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("50000"));
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();
      await mintPool
        .connect(treasury)
        .depositForPool(0, { value: ethers.parseEther("10") });

      // Only advance 1 epoch (still in claim window)
      await time.increase(EPOCH_DURATION);

      await expect(
        mintPool.connect(owner).sweepUnclaimed(0)
      ).to.be.revertedWith("Claim window still open");
    });

    it("should reject sweep from non-owner", async function () {
      const { mintPool, token, user1, treasury } =
        await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("50000"));
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();
      await mintPool
        .connect(treasury)
        .depositForPool(0, { value: ethers.parseEther("10") });

      await time.increase(EPOCH_DURATION * 2);

      await expect(
        mintPool.connect(user1).sweepUnclaimed(0)
      ).to.be.revertedWithCustomError(mintPool, "OwnableUnauthorizedAccount");
    });

    it("should reject double sweep", async function () {
      const { mintPool, token, user1, owner, treasury } =
        await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("50000"));
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();
      await mintPool
        .connect(treasury)
        .depositForPool(0, { value: ethers.parseEther("10") });

      await time.increase(EPOCH_DURATION * 2);
      await mintPool.connect(owner).sweepUnclaimed(0);

      await expect(
        mintPool.connect(owner).sweepUnclaimed(0)
      ).to.be.revertedWith("Already swept");
    });

    it("should emit UnclaimedSwept event", async function () {
      const { mintPool, token, user1, owner, treasury } =
        await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("50000"));
      await mintPool.setContentContract(treasury.address);
      await mintPool.connect(user1).registerForEpoch();

      const deposit = ethers.parseEther("10");
      await mintPool.connect(treasury).depositForPool(0, { value: deposit });

      await time.increase(EPOCH_DURATION * 2);

      await expect(mintPool.connect(owner).sweepUnclaimed(0))
        .to.emit(mintPool, "UnclaimedSwept")
        .withArgs(0, deposit);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Admin", function () {
    it("setContentContract should update and emit event", async function () {
      const { mintPool, owner, user1 } = await loadFixture(deployMintPool);
      await expect(mintPool.setContentContract(user1.address))
        .to.emit(mintPool, "ContentContractUpdated")
        .withArgs(ethers.ZeroAddress, user1.address);
      expect(await mintPool.contentContract()).to.equal(user1.address);
    });

    it("setContentContract should reject zero address", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      await expect(
        mintPool.setContentContract(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });

    it("setContentContract should reject non-owner", async function () {
      const { mintPool, user1 } = await loadFixture(deployMintPool);
      await expect(
        mintPool.connect(user1).setContentContract(user1.address)
      ).to.be.revertedWithCustomError(mintPool, "OwnableUnauthorizedAccount");
    });

    it("setRoyaltySplitter should update and emit event", async function () {
      const { mintPool, user1 } = await loadFixture(deployMintPool);
      await expect(mintPool.setRoyaltySplitter(user1.address))
        .to.emit(mintPool, "RoyaltySplitterUpdated")
        .withArgs(ethers.ZeroAddress, user1.address);
      expect(await mintPool.royaltySplitter()).to.equal(user1.address);
    });

    it("setFeeHook should update and emit event", async function () {
      const { mintPool, user1 } = await loadFixture(deployMintPool);
      await expect(mintPool.setFeeHook(user1.address))
        .to.emit(mintPool, "FeeHookUpdated")
        .withArgs(ethers.ZeroAddress, user1.address);
      expect(await mintPool.feeHook()).to.equal(user1.address);
    });

    it("setCompanionNFT should update and emit event", async function () {
      const { mintPool, companionNFT, user1 } = await loadFixture(deployMintPool);
      const currentAddr = await companionNFT.getAddress();
      // Set to a new address
      await expect(mintPool.setCompanionNFT(user1.address))
        .to.emit(mintPool, "CompanionNFTUpdated")
        .withArgs(currentAddr, user1.address);
      expect(await mintPool.companionNFT()).to.equal(user1.address);
    });

    it("setCompanionNFT should reject zero address", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      await expect(
        mintPool.setCompanionNFT(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });

    it("setCompanionNFT should reject non-owner", async function () {
      const { mintPool, user1 } = await loadFixture(deployMintPool);
      await expect(
        mintPool.connect(user1).setCompanionNFT(user1.address)
      ).to.be.revertedWithCustomError(mintPool, "OwnableUnauthorizedAccount");
    });

    it("setPoolThreshold should update threshold in ascending order", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      // Pool 2 original: 10000. Set to 8000 (still >= pool 1's 5000 and <= pool 3's 25000)
      await expect(mintPool.setPoolThreshold(2, 8000))
        .to.emit(mintPool, "PoolThresholdUpdated")
        .withArgs(2, POOL_THRESHOLDS_WEI[2], ethers.parseEther("8000"));

      const thresholds = await mintPool.getAllPoolThresholds();
      expect(thresholds[2]).to.equal(ethers.parseEther("8000"));
    });

    it("setPoolThreshold should reject breaking ascending order (below previous)", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      // Pool 2 must be >= pool 1 (5000). Set to 4000 should fail.
      await expect(
        mintPool.setPoolThreshold(2, 4000)
      ).to.be.revertedWith("Must be >= previous pool threshold");
    });

    it("setPoolThreshold should reject breaking ascending order (above next)", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      // Pool 2 must be <= pool 3 (25000). Set to 30000 should fail.
      await expect(
        mintPool.setPoolThreshold(2, 30000)
      ).to.be.revertedWith("Must be <= next pool threshold");
    });

    it("setPoolThreshold should reject zero threshold", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      await expect(
        mintPool.setPoolThreshold(0, 0)
      ).to.be.revertedWith("Threshold cannot be zero");
    });

    it("setPoolThreshold should reject invalid pool index", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      await expect(
        mintPool.setPoolThreshold(6, 1000)
      ).to.be.revertedWith("Invalid pool index");
    });

    it("pause and unpause should work", async function () {
      const { mintPool, owner } = await loadFixture(deployMintPool);
      await mintPool.connect(owner).pause();
      expect(await mintPool.paused()).to.equal(true);

      await mintPool.connect(owner).unpause();
      expect(await mintPool.paused()).to.equal(false);
    });

    it("pause should reject non-owner", async function () {
      const { mintPool, user1 } = await loadFixture(deployMintPool);
      await expect(
        mintPool.connect(user1).pause()
      ).to.be.revertedWithCustomError(mintPool, "OwnableUnauthorizedAccount");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("View Functions", function () {
    it("qualifiesForPool should return true when user meets threshold", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("10000"));
      // Pool 0 needs 1K, pool 1 needs 5K, pool 2 needs 10K
      expect(await mintPool.qualifiesForPool(user1.address, 0)).to.equal(true);
      expect(await mintPool.qualifiesForPool(user1.address, 1)).to.equal(true);
      expect(await mintPool.qualifiesForPool(user1.address, 2)).to.equal(true);
      // Pool 3 needs 25K
      expect(await mintPool.qualifiesForPool(user1.address, 3)).to.equal(false);
    });

    it("qualifiesForPool should return false for invalid pool index", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("100000"));
      expect(await mintPool.qualifiesForPool(user1.address, 6)).to.equal(false);
    });

    it("previewClaim should return correct amount", async function () {
      const { mintPool, user1, user1Amount, user2Amount, depositAmount } =
        await setupFullClaimFlow();

      const expected =
        (depositAmount * user1Amount) / (user1Amount + user2Amount);
      const preview = await mintPool.previewClaim(0, 0, user1.address);
      expect(preview).to.equal(expected);
    });

    it("previewClaim should return 0 for non-finalized epoch", async function () {
      const { mintPool, token, user1 } = await loadFixture(deployMintPool);
      await token.mint(user1.address, ethers.parseEther("50000"));
      await mintPool.connect(user1).registerForEpoch();

      expect(await mintPool.previewClaim(0, 0, user1.address)).to.equal(0);
    });

    it("previewClaim should return 0 if user below pool threshold", async function () {
      const { mintPool, user2 } = await setupFullClaimFlow();
      // user2 has 1000 BONZAI, pool 1 requires 5000
      expect(await mintPool.previewClaim(0, 1, user2.address)).to.equal(0);
    });

    it("isRegistered should return false for unregistered user", async function () {
      const { mintPool, user1 } = await loadFixture(deployMintPool);
      expect(await mintPool.isRegistered(0, user1.address)).to.equal(false);
    });

    it("getEpochDeposits should return zeros for epoch with no deposits", async function () {
      const { mintPool } = await loadFixture(deployMintPool);
      const deposits = await mintPool.getEpochDeposits(0);
      for (let i = 0; i < NUM_POOLS; i++) {
        expect(deposits[i]).to.equal(0);
      }
    });
  });
});
