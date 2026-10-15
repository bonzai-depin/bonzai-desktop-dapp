const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// Constants (from helpers/constants.js)
const UNLOCK_PRICE = ethers.parseEther("1");

// Deploy fixture (from helpers/deploy.js)
async function deployUnlock() {
  const [owner, foundation, liquidity, user1, user2, user3] = await ethers.getSigners();
  const BonzaiUnlock = await ethers.getContractFactory("BonzaiUnlock");
  const unlock = await BonzaiUnlock.deploy(foundation.address, liquidity.address, UNLOCK_PRICE);
  return { unlock, owner, foundation, liquidity, user1, user2, user3 };
}

describe("BonzaiUnlock", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      const { unlock, owner } = await loadFixture(deployUnlock);
      expect(await unlock.owner()).to.equal(owner.address);
    });

    it("should set the correct foundation wallet", async function () {
      const { unlock, foundation } = await loadFixture(deployUnlock);
      expect(await unlock.foundationWallet()).to.equal(foundation.address);
    });

    it("should set the correct liquidity wallet", async function () {
      const { unlock, liquidity } = await loadFixture(deployUnlock);
      expect(await unlock.liquidityWallet()).to.equal(liquidity.address);
    });

    it("should set the correct initial unlock price", async function () {
      const { unlock } = await loadFixture(deployUnlock);
      expect(await unlock.unlockPrice()).to.equal(UNLOCK_PRICE);
    });

    it("should revert when foundation wallet is zero address", async function () {
      const [, , liquidity] = await ethers.getSigners();
      const BonzaiUnlock = await ethers.getContractFactory("BonzaiUnlock");
      await expect(
        BonzaiUnlock.deploy(ethers.ZeroAddress, liquidity.address, UNLOCK_PRICE)
      ).to.be.revertedWithCustomError(BonzaiUnlock, "ZeroAddress");
    });

    it("should revert when liquidity wallet is zero address", async function () {
      const [, foundation] = await ethers.getSigners();
      const BonzaiUnlock = await ethers.getContractFactory("BonzaiUnlock");
      await expect(
        BonzaiUnlock.deploy(foundation.address, ethers.ZeroAddress, UNLOCK_PRICE)
      ).to.be.revertedWithCustomError(BonzaiUnlock, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // unlock()
  // ═══════════════════════════════════════════════════════════════════════════

  describe("unlock()", function () {
    it("should unlock the caller with exact payment", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      expect(await unlock.hasUnlocked(user1.address)).to.be.true;
    });

    it("should emit Unlocked event with correct args", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      await expect(unlock.connect(user1).unlock({ value: UNLOCK_PRICE }))
        .to.emit(unlock, "Unlocked")
        .withArgs(user1.address, user1.address, UNLOCK_PRICE, anyValue);
    });

    it("should increment totalPaidUnlocks", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      expect(await unlock.totalPaidUnlocks()).to.equal(1);
    });

    it("should increment totalCollected", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      expect(await unlock.totalCollected()).to.equal(UNLOCK_PRICE);
    });

    it("should revert with AlreadyUnlocked when unlocking twice", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      await expect(
        unlock.connect(user1).unlock({ value: UNLOCK_PRICE })
      ).to.be.revertedWithCustomError(unlock, "AlreadyUnlocked")
        .withArgs(user1.address);
    });

    it("should revert with IncorrectPayment when sending too little", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      const tooLittle = ethers.parseEther("0.5");
      await expect(
        unlock.connect(user1).unlock({ value: tooLittle })
      ).to.be.revertedWithCustomError(unlock, "IncorrectPayment")
        .withArgs(tooLittle, UNLOCK_PRICE);
    });

    it("should revert with IncorrectPayment when sending too much", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      const tooMuch = ethers.parseEther("2");
      await expect(
        unlock.connect(user1).unlock({ value: tooMuch })
      ).to.be.revertedWithCustomError(unlock, "IncorrectPayment")
        .withArgs(tooMuch, UNLOCK_PRICE);
    });

    it("should revert when paused", async function () {
      const { unlock, owner, user1 } = await loadFixture(deployUnlock);
      await unlock.connect(owner).pause();
      await expect(
        unlock.connect(user1).unlock({ value: UNLOCK_PRICE })
      ).to.be.revertedWithCustomError(unlock, "EnforcedPause");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // unlockFor()
  // ═══════════════════════════════════════════════════════════════════════════

  describe("unlockFor()", function () {
    it("should unlock the recipient when paid by another user", async function () {
      const { unlock, user1, user2 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlockFor(user2.address, { value: UNLOCK_PRICE });
      expect(await unlock.hasUnlocked(user2.address)).to.be.true;
      expect(await unlock.hasUnlocked(user1.address)).to.be.false;
    });

    it("should emit Unlocked event with payer and recipient", async function () {
      const { unlock, user1, user2 } = await loadFixture(deployUnlock);
      await expect(unlock.connect(user1).unlockFor(user2.address, { value: UNLOCK_PRICE }))
        .to.emit(unlock, "Unlocked")
        .withArgs(user2.address, user1.address, UNLOCK_PRICE, anyValue);
    });

    it("should revert with ZeroAddress for zero-address recipient", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      await expect(
        unlock.connect(user1).unlockFor(ethers.ZeroAddress, { value: UNLOCK_PRICE })
      ).to.be.revertedWithCustomError(unlock, "ZeroAddress");
    });

    it("should revert with AlreadyUnlocked if recipient already unlocked", async function () {
      const { unlock, user1, user2 } = await loadFixture(deployUnlock);
      await unlock.connect(user2).unlock({ value: UNLOCK_PRICE });
      await expect(
        unlock.connect(user1).unlockFor(user2.address, { value: UNLOCK_PRICE })
      ).to.be.revertedWithCustomError(unlock, "AlreadyUnlocked")
        .withArgs(user2.address);
    });

    it("should revert when paused", async function () {
      const { unlock, owner, user1, user2 } = await loadFixture(deployUnlock);
      await unlock.connect(owner).pause();
      await expect(
        unlock.connect(user1).unlockFor(user2.address, { value: UNLOCK_PRICE })
      ).to.be.revertedWithCustomError(unlock, "EnforcedPause");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // transferUnlock()
  // ═══════════════════════════════════════════════════════════════════════════

  describe("transferUnlock()", function () {
    it("should transfer unlock rights from sender to recipient", async function () {
      const { unlock, user1, user2 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      await unlock.connect(user1).transferUnlock(user2.address);
      expect(await unlock.hasUnlocked(user1.address)).to.be.false;
      expect(await unlock.hasUnlocked(user2.address)).to.be.true;
    });

    it("should emit UnlockTransferred event", async function () {
      const { unlock, user1, user2 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      await expect(unlock.connect(user1).transferUnlock(user2.address))
        .to.emit(unlock, "UnlockTransferred")
        .withArgs(user1.address, user2.address, anyValue);
    });

    it("should revert with NotUnlocked if sender has not unlocked", async function () {
      const { unlock, user1, user2 } = await loadFixture(deployUnlock);
      await expect(
        unlock.connect(user1).transferUnlock(user2.address)
      ).to.be.revertedWithCustomError(unlock, "NotUnlocked")
        .withArgs(user1.address);
    });

    it("should revert with AlreadyUnlocked if recipient already unlocked", async function () {
      const { unlock, user1, user2 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      await unlock.connect(user2).unlock({ value: UNLOCK_PRICE });
      await expect(
        unlock.connect(user1).transferUnlock(user2.address)
      ).to.be.revertedWithCustomError(unlock, "AlreadyUnlocked")
        .withArgs(user2.address);
    });

    it("should revert when transferring to self (AlreadyUnlocked fires before SelfTransfer)", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      // When to == msg.sender and sender is unlocked, hasUnlocked[to] is true,
      // so AlreadyUnlocked is checked before the SelfTransfer guard.
      await expect(
        unlock.connect(user1).transferUnlock(user1.address)
      ).to.be.revertedWithCustomError(unlock, "AlreadyUnlocked")
        .withArgs(user1.address);
    });

    it("should revert with ZeroAddress for zero-address recipient", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      await expect(
        unlock.connect(user1).transferUnlock(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(unlock, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // giftUnlock()
  // ═══════════════════════════════════════════════════════════════════════════

  describe("giftUnlock()", function () {
    it("should unlock the recipient for free (owner only)", async function () {
      const { unlock, owner, user1 } = await loadFixture(deployUnlock);
      await unlock.connect(owner).giftUnlock(user1.address);
      expect(await unlock.hasUnlocked(user1.address)).to.be.true;
    });

    it("should increment totalGiftedUnlocks", async function () {
      const { unlock, owner, user1 } = await loadFixture(deployUnlock);
      await unlock.connect(owner).giftUnlock(user1.address);
      expect(await unlock.totalGiftedUnlocks()).to.equal(1);
    });

    it("should emit UnlockGifted event", async function () {
      const { unlock, owner, user1 } = await loadFixture(deployUnlock);
      await expect(unlock.connect(owner).giftUnlock(user1.address))
        .to.emit(unlock, "UnlockGifted")
        .withArgs(user1.address, owner.address, anyValue);
    });

    it("should revert when called by non-owner/non-treasury", async function () {
      const { unlock, user1, user2 } = await loadFixture(deployUnlock);
      await expect(
        unlock.connect(user1).giftUnlock(user2.address)
      ).to.be.revertedWith("Not owner/treasury");
    });

    it("should revert with AlreadyUnlocked if recipient already unlocked", async function () {
      const { unlock, owner, user1 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      await expect(
        unlock.connect(owner).giftUnlock(user1.address)
      ).to.be.revertedWithCustomError(unlock, "AlreadyUnlocked")
        .withArgs(user1.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // batchGiftUnlock()
  // ═══════════════════════════════════════════════════════════════════════════

  describe("batchGiftUnlock()", function () {
    it("should unlock multiple recipients and update totalGiftedUnlocks", async function () {
      const { unlock, owner, user1, user2, user3 } = await loadFixture(deployUnlock);
      await unlock.connect(owner).batchGiftUnlock([
        user1.address, user2.address, user3.address,
      ]);
      expect(await unlock.hasUnlocked(user1.address)).to.be.true;
      expect(await unlock.hasUnlocked(user2.address)).to.be.true;
      expect(await unlock.hasUnlocked(user3.address)).to.be.true;
      expect(await unlock.totalGiftedUnlocks()).to.equal(3);
    });

    it("should skip zero addresses and emit GiftSkipped", async function () {
      const { unlock, owner, user1 } = await loadFixture(deployUnlock);
      await expect(
        unlock.connect(owner).batchGiftUnlock([ethers.ZeroAddress, user1.address])
      ).to.emit(unlock, "GiftSkipped")
        .withArgs(ethers.ZeroAddress, "zero address");
      expect(await unlock.hasUnlocked(user1.address)).to.be.true;
      expect(await unlock.totalGiftedUnlocks()).to.equal(1);
    });

    it("should skip already-unlocked addresses and emit GiftSkipped", async function () {
      const { unlock, owner, user1, user2 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      await expect(
        unlock.connect(owner).batchGiftUnlock([user1.address, user2.address])
      ).to.emit(unlock, "GiftSkipped")
        .withArgs(user1.address, "already unlocked");
      expect(await unlock.hasUnlocked(user2.address)).to.be.true;
      expect(await unlock.totalGiftedUnlocks()).to.equal(1);
    });

    it("should revert with BatchSizeTooLarge when exceeding MAX_BATCH_SIZE", async function () {
      const { unlock, owner } = await loadFixture(deployUnlock);
      const addresses = [];
      for (let i = 0; i < 101; i++) {
        addresses.push(ethers.Wallet.createRandom().address);
      }
      await expect(
        unlock.connect(owner).batchGiftUnlock(addresses)
      ).to.be.revertedWithCustomError(unlock, "BatchSizeTooLarge")
        .withArgs(101, 100);
    });

    it("should revert when called by non-owner/non-treasury", async function () {
      const { unlock, user1, user2 } = await loadFixture(deployUnlock);
      await expect(
        unlock.connect(user1).batchGiftUnlock([user2.address])
      ).to.be.revertedWith("Not owner/treasury");
    });

    it("should handle empty array without reverting", async function () {
      const { unlock, owner } = await loadFixture(deployUnlock);
      await unlock.connect(owner).batchGiftUnlock([]);
      expect(await unlock.totalGiftedUnlocks()).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // withdrawProceeds()
  // ═══════════════════════════════════════════════════════════════════════════

  describe("withdrawProceeds()", function () {
    it("should split proceeds 50/50 between foundation and liquidity wallets", async function () {
      const { unlock, owner, foundation, liquidity, user1 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });

      const foundationBefore = await ethers.provider.getBalance(foundation.address);
      const liquidityBefore = await ethers.provider.getBalance(liquidity.address);

      await unlock.connect(owner).withdrawProceeds();

      const foundationAfter = await ethers.provider.getBalance(foundation.address);
      const liquidityAfter = await ethers.provider.getBalance(liquidity.address);

      const halfPrice = UNLOCK_PRICE / 2n;
      expect(foundationAfter - foundationBefore).to.equal(halfPrice);
      expect(liquidityAfter - liquidityBefore).to.equal(halfPrice);
    });

    it("should emit ProceedsWithdrawn event with correct amounts", async function () {
      const { unlock, owner, foundation, liquidity, user1 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });

      const halfPrice = UNLOCK_PRICE / 2n;
      await expect(unlock.connect(owner).withdrawProceeds())
        .to.emit(unlock, "ProceedsWithdrawn")
        .withArgs(foundation.address, halfPrice, liquidity.address, halfPrice, anyValue);
    });

    it("should leave zero contract balance after withdrawal", async function () {
      const { unlock, owner, user1 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      await unlock.connect(owner).withdrawProceeds();
      expect(await unlock.getBalance()).to.equal(0);
    });

    it("should revert with NoProceeds when balance is zero", async function () {
      const { unlock, owner } = await loadFixture(deployUnlock);
      await expect(
        unlock.connect(owner).withdrawProceeds()
      ).to.be.revertedWithCustomError(unlock, "NoProceeds");
    });

    it("should revert when called by non-owner", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      await expect(
        unlock.connect(user1).withdrawProceeds()
      ).to.be.revertedWithCustomError(unlock, "OwnableUnauthorizedAccount");
    });

    it("preserves both shares when the foundation rejects ETH", async function () {
      const [owner, , , user1] = await ethers.getSigners();

      const ETHRejector = await ethers.getContractFactory("ETHRejector");
      const rejector = await ETHRejector.deploy();
      const rejectorAddr = await rejector.getAddress();

      const [, , liquidity] = await ethers.getSigners();
      const BonzaiUnlock = await ethers.getContractFactory("BonzaiUnlock");
      const unlockBad = await BonzaiUnlock.deploy(rejectorAddr, liquidity.address, UNLOCK_PRICE);

      await unlockBad.connect(user1).unlock({ value: UNLOCK_PRICE });

      const liquidityBefore = await ethers.provider.getBalance(liquidity.address);
      const halfPrice = UNLOCK_PRICE / 2n;

      await expect(unlockBad.connect(owner).withdrawProceeds())
        .to.be.revertedWith("Proceeds transfer failed");

      const liquidityAfter = await ethers.provider.getBalance(liquidity.address);
      expect(liquidityAfter - liquidityBefore).to.equal(0n);
      expect(await ethers.provider.getBalance(await unlockBad.getAddress())).to.equal(UNLOCK_PRICE);
    });

    it("preserves both shares when liquidity rejects ETH", async function () {
      const [owner, foundation, , user1] = await ethers.getSigners();

      const ETHRejector = await ethers.getContractFactory("ETHRejector");
      const rejector = await ETHRejector.deploy();
      const rejectorAddr = await rejector.getAddress();

      const BonzaiUnlock = await ethers.getContractFactory("BonzaiUnlock");
      const unlockBad = await BonzaiUnlock.deploy(foundation.address, rejectorAddr, UNLOCK_PRICE);

      await unlockBad.connect(user1).unlock({ value: UNLOCK_PRICE });

      const foundationBefore = await ethers.provider.getBalance(foundation.address);
      const halfPrice = UNLOCK_PRICE / 2n;

      await expect(unlockBad.connect(owner).withdrawProceeds())
        .to.be.revertedWith("Proceeds transfer failed");

      const foundationAfter = await ethers.provider.getBalance(foundation.address);
      expect(foundationAfter - foundationBefore).to.equal(0n);
      expect(await ethers.provider.getBalance(await unlockBad.getAddress())).to.equal(UNLOCK_PRICE);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // receive() and fallback()
  // ═══════════════════════════════════════════════════════════════════════════

  describe("receive() and fallback()", function () {
    it("should reject direct ETH transfers (receive)", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      const unlockAddr = await unlock.getAddress();
      await expect(
        user1.sendTransaction({ to: unlockAddr, value: UNLOCK_PRICE })
      ).to.be.revertedWith("Use unlock() or unlockFor()");
    });

    it("should reject calls to non-existent functions (fallback)", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      const unlockAddr = await unlock.getAddress();
      await expect(
        user1.sendTransaction({
          to: unlockAddr,
          value: UNLOCK_PRICE,
          data: "0xdeadbeef",
        })
      ).to.be.revertedWith("Function does not exist");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("View functions", function () {
    it("isUnlocked() should return false for non-unlocked address", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      expect(await unlock.isUnlocked(user1.address)).to.be.false;
    });

    it("isUnlocked() should return true after unlock", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      expect(await unlock.isUnlocked(user1.address)).to.be.true;
    });

    it("getBalance() should return contract ETH balance", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      expect(await unlock.getBalance()).to.equal(0);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      expect(await unlock.getBalance()).to.equal(UNLOCK_PRICE);
    });

    it("getStats() should return correct stats after multiple operations", async function () {
      const { unlock, owner, user1, user2, user3 } = await loadFixture(deployUnlock);

      // 2 paid unlocks
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      await unlock.connect(user2).unlock({ value: UNLOCK_PRICE });

      // 1 gifted unlock
      await unlock.connect(owner).giftUnlock(user3.address);

      const [paidUnlocks, giftedUnlocks, totalUnlocks, collected, balance, price] =
        await unlock.getStats();

      expect(paidUnlocks).to.equal(2);
      expect(giftedUnlocks).to.equal(1);
      expect(totalUnlocks).to.equal(3);
      expect(collected).to.equal(UNLOCK_PRICE * 2n);
      expect(balance).to.equal(UNLOCK_PRICE * 2n);
      expect(price).to.equal(UNLOCK_PRICE);
    });

    it("areUnlocked() should return correct status for multiple addresses", async function () {
      const { unlock, user1, user2, user3 } = await loadFixture(deployUnlock);
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });

      const results = await unlock.areUnlocked([
        user1.address,
        user2.address,
        user3.address,
      ]);

      expect(results[0]).to.be.true;
      expect(results[1]).to.be.false;
      expect(results[2]).to.be.false;
    });

    it("areUnlocked() should handle empty array", async function () {
      const { unlock } = await loadFixture(deployUnlock);
      const results = await unlock.areUnlocked([]);
      expect(results.length).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // setUnlockPrice()
  // ═══════════════════════════════════════════════════════════════════════════

  describe("setUnlockPrice()", function () {
    it("should update the unlock price", async function () {
      const { unlock, owner } = await loadFixture(deployUnlock);
      const newPrice = ethers.parseEther("2");
      await unlock.connect(owner).setUnlockPrice(newPrice);
      expect(await unlock.unlockPrice()).to.equal(newPrice);
    });

    it("should emit UnlockPriceUpdated event", async function () {
      const { unlock, owner } = await loadFixture(deployUnlock);
      const newPrice = ethers.parseEther("2");
      await expect(unlock.connect(owner).setUnlockPrice(newPrice))
        .to.emit(unlock, "UnlockPriceUpdated")
        .withArgs(UNLOCK_PRICE, newPrice, anyValue);
    });

    it("should revert when called by non-owner", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      await expect(
        unlock.connect(user1).setUnlockPrice(ethers.parseEther("2"))
      ).to.be.revertedWithCustomError(unlock, "OwnableUnauthorizedAccount");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // pause() / unpause()
  // ═══════════════════════════════════════════════════════════════════════════

  describe("pause() / unpause()", function () {
    it("should allow owner to pause and unpause", async function () {
      const { unlock, owner, user1 } = await loadFixture(deployUnlock);
      await unlock.connect(owner).pause();
      await expect(
        unlock.connect(user1).unlock({ value: UNLOCK_PRICE })
      ).to.be.revertedWithCustomError(unlock, "EnforcedPause");

      await unlock.connect(owner).unpause();
      await unlock.connect(user1).unlock({ value: UNLOCK_PRICE });
      expect(await unlock.hasUnlocked(user1.address)).to.be.true;
    });

    it("should revert pause when called by non-owner", async function () {
      const { unlock, user1 } = await loadFixture(deployUnlock);
      await expect(
        unlock.connect(user1).pause()
      ).to.be.revertedWithCustomError(unlock, "OwnableUnauthorizedAccount");
    });
  });
});
