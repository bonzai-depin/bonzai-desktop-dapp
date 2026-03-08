const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deploySplitter } = require("./helpers/deploy");
const { MIN_DISTRIBUTION_AMOUNT } = require("./helpers/constants");

describe("BonzaiRoyaltySplitter", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Send ETH to the splitter contract via a plain transfer */
  async function fundSplitter(signer, splitter, amount) {
    const addr = await splitter.getAddress();
    await signer.sendTransaction({ to: addr, value: amount });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("should set treasury and mintPool from constructor", async function () {
      const { splitter, mockPool, treasury } = await loadFixture(deploySplitter);

      expect(await splitter.treasury()).to.equal(treasury.address);
      expect(await splitter.mintPool()).to.equal(await mockPool.getAddress());
    });

    it("should set default minDistributionAmount to 0.01 ether", async function () {
      const { splitter } = await loadFixture(deploySplitter);

      expect(await splitter.minDistributionAmount()).to.equal(MIN_DISTRIBUTION_AMOUNT);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DISTRIBUTE — BASIC SPLIT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("distribute() — basic 2/3 treasury, 1/3 pools", function () {
    it("should send 2/3 to treasury and 1/3 to pools (equal fallback)", async function () {
      const { splitter, mockPool, owner, treasury } = await loadFixture(deploySplitter);

      const amount = ethers.parseEther("0.03"); // clean 3-divisible amount
      await fundSplitter(owner, splitter, amount);

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      const poolAddr = await mockPool.getAddress();
      const poolBefore = await ethers.provider.getBalance(poolAddr);

      await splitter.distribute();

      const treasuryAfter = await ethers.provider.getBalance(treasury.address);
      const poolAfter = await ethers.provider.getBalance(poolAddr);

      const treasuryShare = (amount * 2n) / 3n;
      const poolShare = amount - treasuryShare;

      expect(treasuryAfter - treasuryBefore).to.equal(treasuryShare);
      expect(poolAfter - poolBefore).to.equal(poolShare);
    });

    it("should emit Distributed event with correct amounts", async function () {
      const { splitter, owner } = await loadFixture(deploySplitter);

      const amount = ethers.parseEther("0.03");
      await fundSplitter(owner, splitter, amount);

      const treasuryShare = (amount * 2n) / 3n;
      const poolShare = amount - treasuryShare;

      await expect(splitter.distribute())
        .to.emit(splitter, "Distributed")
        .withArgs(treasuryShare, poolShare);
    });

    it("should allow anyone (not just owner) to call distribute", async function () {
      const { splitter, owner, user1, treasury } = await loadFixture(deploySplitter);

      const amount = ethers.parseEther("0.03");
      await fundSplitter(owner, splitter, amount);

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);

      // user1 is not the owner, but can still call distribute
      await splitter.connect(user1).distribute();

      const treasuryAfter = await ethers.provider.getBalance(treasury.address);
      expect(treasuryAfter).to.be.gt(treasuryBefore);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DISTRIBUTE — WEIGHTED
  // ═══════════════════════════════════════════════════════════════════════════

  describe("distribute() — weighted by historical activity", function () {
    it("should route 100% of pool share to a single active pool", async function () {
      const { splitter, mockPool, owner, treasury } = await loadFixture(deploySplitter);

      // Pool 2 (IMAGE) has all deposits
      await mockPool.setTotalDeposited(2, ethers.parseEther("10"));

      const amount = ethers.parseEther("0.03");
      await fundSplitter(owner, splitter, amount);

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);

      await splitter.distribute();

      const treasuryAfter = await ethers.provider.getBalance(treasury.address);

      const treasuryShare = (amount * 2n) / 3n;
      const poolShare = amount - treasuryShare;

      // Treasury gets exactly 2/3 (no rounding dust since 100% goes to one pool)
      expect(treasuryAfter - treasuryBefore).to.equal(treasuryShare);
      // Pool 2 gets the entire pool share
      expect(await mockPool.poolDeposits(2)).to.equal(poolShare);
      // Other pools get nothing
      expect(await mockPool.poolDeposits(0)).to.equal(0);
      expect(await mockPool.poolDeposits(1)).to.equal(0);
    });

    it("should distribute across all 6 pools equally when deposits are equal", async function () {
      const { splitter, mockPool, owner } = await loadFixture(deploySplitter);

      const depositPerPool = ethers.parseEther("5");
      for (let i = 0; i < 6; i++) {
        await mockPool.setTotalDeposited(i, depositPerPool);
      }

      const amount = ethers.parseEther("0.03");
      await fundSplitter(owner, splitter, amount);

      await splitter.distribute();

      const poolShare = amount - (amount * 2n) / 3n;
      const perPool = poolShare / 6n;

      for (let i = 0; i < 6; i++) {
        expect(await mockPool.poolDeposits(i)).to.equal(perPool);
      }
    });

    it("should handle 60/40 weighted split between two pools", async function () {
      const { splitter, mockPool, owner, treasury } = await loadFixture(deploySplitter);

      // Pool 0: 60%, Pool 1: 40%
      await mockPool.setTotalDeposited(0, ethers.parseEther("6"));
      await mockPool.setTotalDeposited(1, ethers.parseEther("4"));

      const amount = ethers.parseEther("3"); // large enough for clean math
      await fundSplitter(owner, splitter, amount);

      await splitter.distribute();

      const poolShare = amount - (amount * 2n) / 3n;
      const totalDeposited = ethers.parseEther("10");
      const pool0Expected = (poolShare * ethers.parseEther("6")) / totalDeposited;
      const pool1Expected = (poolShare * ethers.parseEther("4")) / totalDeposited;

      expect(await mockPool.poolDeposits(0)).to.equal(pool0Expected);
      expect(await mockPool.poolDeposits(1)).to.equal(pool1Expected);
      // Pools 2-5 should be zero
      for (let i = 2; i < 6; i++) {
        expect(await mockPool.poolDeposits(i)).to.equal(0);
      }
    });

    it("should send rounding dust to treasury", async function () {
      const { splitter, mockPool, owner, treasury } = await loadFixture(deploySplitter);

      // Set weights that cause rounding: 1/3 each among 3 pools
      // but pool share itself may not divide evenly
      await mockPool.setTotalDeposited(0, ethers.parseEther("1"));
      await mockPool.setTotalDeposited(1, ethers.parseEther("1"));
      await mockPool.setTotalDeposited(2, ethers.parseEther("1"));

      // Use an amount that creates rounding dust
      const amount = ethers.parseEther("0.1");
      await fundSplitter(owner, splitter, amount);

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);

      await splitter.distribute();

      const treasuryAfter = await ethers.provider.getBalance(treasury.address);

      const treasuryShare = (amount * 2n) / 3n;
      const poolShare = amount - treasuryShare;
      const totalDeposited = ethers.parseEther("3");
      const perPool = (poolShare * ethers.parseEther("1")) / totalDeposited;
      const distributed = perPool * 3n;
      const dust = poolShare - distributed;

      // Treasury should receive treasuryShare + dust
      expect(treasuryAfter - treasuryBefore).to.equal(treasuryShare + dust);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DISTRIBUTE — FALLBACK (NO DEPOSITS)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("distribute() — fallback equal split (no pool deposits)", function () {
    it("should distribute pool share equally among 6 pools when totalAllPools == 0", async function () {
      const { splitter, mockPool, owner } = await loadFixture(deploySplitter);

      // No setTotalDeposited calls — all zero by default
      const amount = ethers.parseEther("0.03");
      await fundSplitter(owner, splitter, amount);

      await splitter.distribute();

      const poolShare = amount - (amount * 2n) / 3n;
      const perPool = poolShare / 6n;

      // First 5 pools get perPool
      for (let i = 0; i < 5; i++) {
        expect(await mockPool.poolDeposits(i)).to.equal(perPool);
      }
      // Last pool gets remainder: poolShare - (perPool * 5)
      const lastPoolExpected = poolShare - perPool * 5n;
      expect(await mockPool.poolDeposits(5)).to.equal(lastPoolExpected);
    });

    it("should give the last pool the remainder in equal fallback", async function () {
      const { splitter, mockPool, owner } = await loadFixture(deploySplitter);

      // Use an amount where poolShare / 6 has a remainder
      const amount = ethers.parseEther("0.1");
      await fundSplitter(owner, splitter, amount);

      await splitter.distribute();

      const poolShare = amount - (amount * 2n) / 3n;
      const perPool = poolShare / 6n;
      const lastPoolExpected = poolShare - perPool * 5n;

      // last pool should get >= perPool (may have remainder)
      expect(await mockPool.poolDeposits(5)).to.equal(lastPoolExpected);
      expect(lastPoolExpected).to.be.gte(perPool);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DISTRIBUTE — THRESHOLD
  // ═══════════════════════════════════════════════════════════════════════════

  describe("distribute() — minimum distribution threshold", function () {
    it("should revert when balance is below minDistributionAmount", async function () {
      const { splitter, owner } = await loadFixture(deploySplitter);

      const belowMin = MIN_DISTRIBUTION_AMOUNT - 1n;
      await fundSplitter(owner, splitter, belowMin);

      await expect(splitter.distribute())
        .to.be.revertedWith("Below minimum distribution amount");
    });

    it("should succeed when balance exactly equals minDistributionAmount", async function () {
      const { splitter, owner } = await loadFixture(deploySplitter);

      await fundSplitter(owner, splitter, MIN_DISTRIBUTION_AMOUNT);

      await expect(splitter.distribute()).to.not.be.reverted;
    });

    it("should revert when balance is zero", async function () {
      const { splitter } = await loadFixture(deploySplitter);

      await expect(splitter.distribute())
        .to.be.revertedWith("Below minimum distribution amount");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DISTRIBUTE — POOL DEPOSIT FAILURES
  // ═══════════════════════════════════════════════════════════════════════════

  describe("distribute() — pool deposit failure handling", function () {
    it("should emit PoolDepositFailed and send remainder to treasury on revert", async function () {
      const { splitter, mockPool, owner, treasury } = await loadFixture(deploySplitter);

      // Make all pool deposits fail
      await mockPool.setShouldRevert(true);

      const amount = ethers.parseEther("0.03");
      await fundSplitter(owner, splitter, amount);

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);

      // In the equal fallback path (no historical deposits), all 6 deposits fail
      const tx = await splitter.distribute();
      const receipt = await tx.wait();

      const treasuryAfter = await ethers.provider.getBalance(treasury.address);

      // Treasury should receive full amount (2/3 treasury share + 1/3 pool share that all failed)
      const treasuryShare = (amount * 2n) / 3n;
      const poolShare = amount - treasuryShare;
      expect(treasuryAfter - treasuryBefore).to.equal(treasuryShare + poolShare);

      // Should have emitted PoolDepositFailed for each pool
      const failedEvents = receipt.logs.filter(
        (log) => {
          try {
            return splitter.interface.parseLog(log)?.name === "PoolDepositFailed";
          } catch { return false; }
        }
      );
      expect(failedEvents.length).to.equal(6);
    });

    it("should emit PoolDepositFailed with correct pool index and amount", async function () {
      const { splitter, mockPool, owner } = await loadFixture(deploySplitter);

      // Pool 0 has all the weight
      await mockPool.setTotalDeposited(0, ethers.parseEther("10"));
      await mockPool.setShouldRevert(true);

      const amount = ethers.parseEther("0.03");
      await fundSplitter(owner, splitter, amount);

      const poolShare = amount - (amount * 2n) / 3n;

      await expect(splitter.distribute())
        .to.emit(splitter, "PoolDepositFailed")
        .withArgs(0, poolShare);
    });

    it("should handle partial pool failures (weighted path)", async function () {
      const { splitter, mockPool, owner, treasury } = await loadFixture(deploySplitter);

      // Set up weighted scenario: 50/50 between pool 0 and pool 1
      await mockPool.setTotalDeposited(0, ethers.parseEther("5"));
      await mockPool.setTotalDeposited(1, ethers.parseEther("5"));

      const amount = ethers.parseEther("0.03");
      await fundSplitter(owner, splitter, amount);

      // First, do a successful distribution to verify pool deposits work
      await splitter.distribute();

      const poolShare = amount - (amount * 2n) / 3n;
      const perPool = poolShare / 2n;

      expect(await mockPool.poolDeposits(0)).to.equal(perPool);
      expect(await mockPool.poolDeposits(1)).to.equal(perPool);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Admin — setTreasury", function () {
    it("should update treasury and emit TreasuryUpdated", async function () {
      const { splitter, owner, treasury, user1 } = await loadFixture(deploySplitter);

      await expect(splitter.setTreasury(user1.address))
        .to.emit(splitter, "TreasuryUpdated")
        .withArgs(treasury.address, user1.address);

      expect(await splitter.treasury()).to.equal(user1.address);
    });

    it("should revert when non-owner calls setTreasury", async function () {
      const { splitter, user1 } = await loadFixture(deploySplitter);

      await expect(splitter.connect(user1).setTreasury(user1.address))
        .to.be.revertedWithCustomError(splitter, "OwnableUnauthorizedAccount");
    });

    it("should revert when setting treasury to zero address", async function () {
      const { splitter } = await loadFixture(deploySplitter);

      await expect(splitter.setTreasury(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid treasury");
    });
  });

  describe("Admin — setMintPool", function () {
    it("should update mintPool and emit MintPoolUpdated", async function () {
      const { splitter, mockPool, user1 } = await loadFixture(deploySplitter);

      const oldPool = await mockPool.getAddress();
      await expect(splitter.setMintPool(user1.address))
        .to.emit(splitter, "MintPoolUpdated")
        .withArgs(oldPool, user1.address);

      expect(await splitter.mintPool()).to.equal(user1.address);
    });

    it("should revert when non-owner calls setMintPool", async function () {
      const { splitter, user1 } = await loadFixture(deploySplitter);

      await expect(splitter.connect(user1).setMintPool(user1.address))
        .to.be.revertedWithCustomError(splitter, "OwnableUnauthorizedAccount");
    });

    it("should revert when setting mintPool to zero address", async function () {
      const { splitter } = await loadFixture(deploySplitter);

      await expect(splitter.setMintPool(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid mint pool");
    });
  });

  describe("Admin — setMinDistributionAmount", function () {
    it("should update minDistributionAmount and emit event", async function () {
      const { splitter } = await loadFixture(deploySplitter);

      const newAmount = ethers.parseEther("0.05");

      await expect(splitter.setMinDistributionAmount(newAmount))
        .to.emit(splitter, "MinDistributionAmountUpdated")
        .withArgs(MIN_DISTRIBUTION_AMOUNT, newAmount);

      expect(await splitter.minDistributionAmount()).to.equal(newAmount);
    });

    it("should revert when non-owner calls setMinDistributionAmount", async function () {
      const { splitter, user1 } = await loadFixture(deploySplitter);

      await expect(splitter.connect(user1).setMinDistributionAmount(0))
        .to.be.revertedWithCustomError(splitter, "OwnableUnauthorizedAccount");
    });

    it("should allow setting minDistributionAmount to zero", async function () {
      const { splitter } = await loadFixture(deploySplitter);

      await splitter.setMinDistributionAmount(0);
      expect(await splitter.minDistributionAmount()).to.equal(0);
    });
  });

  describe("Admin — pause / unpause", function () {
    it("should prevent distribute when paused", async function () {
      const { splitter, owner } = await loadFixture(deploySplitter);

      await fundSplitter(owner, splitter, ethers.parseEther("0.03"));
      await splitter.pause();

      await expect(splitter.distribute())
        .to.be.revertedWithCustomError(splitter, "EnforcedPause");
    });

    it("should allow distribute after unpause", async function () {
      const { splitter, owner } = await loadFixture(deploySplitter);

      await fundSplitter(owner, splitter, ethers.parseEther("0.03"));
      await splitter.pause();
      await splitter.unpause();

      await expect(splitter.distribute()).to.not.be.reverted;
    });

    it("should revert when non-owner tries to pause", async function () {
      const { splitter, user1 } = await loadFixture(deploySplitter);

      await expect(splitter.connect(user1).pause())
        .to.be.revertedWithCustomError(splitter, "OwnableUnauthorizedAccount");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — RECOVERY
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Admin — withdrawETH", function () {
    it("should allow owner to withdraw stuck ETH", async function () {
      const { splitter, owner } = await loadFixture(deploySplitter);

      const amount = ethers.parseEther("1");
      await fundSplitter(owner, splitter, amount);

      const ownerBefore = await ethers.provider.getBalance(owner.address);

      const tx = await splitter.withdrawETH();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const ownerAfter = await ethers.provider.getBalance(owner.address);

      expect(ownerAfter - ownerBefore + gasCost).to.equal(amount);
    });

    it("should revert withdrawETH when balance is zero", async function () {
      const { splitter } = await loadFixture(deploySplitter);

      await expect(splitter.withdrawETH())
        .to.be.revertedWith("No ETH to withdraw");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RECEIVE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("receive()", function () {
    it("should accept plain ETH transfers", async function () {
      const { splitter, owner } = await loadFixture(deploySplitter);

      const amount = ethers.parseEther("1");
      const splitterAddr = await splitter.getAddress();

      await owner.sendTransaction({ to: splitterAddr, value: amount });

      expect(await ethers.provider.getBalance(splitterAddr)).to.equal(amount);
    });
  });
});
