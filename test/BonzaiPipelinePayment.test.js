const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployPipelinePayment } = require("./helpers/deploy");
const { PLATFORM_FEE_BPS } = require("./helpers/constants");

describe("BonzaiPipelinePayment", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  async function getDomain(payment) {
    return {
      name: "BonzAI x402",
      version: "2",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await payment.getAddress(),
    };
  }

  const PIPELINE_TYPES = {
    PipelinePayment: [
      { name: "providers", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
      { name: "totalAmount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "expiry", type: "uint256" },
      { name: "service", type: "string" },
      { name: "sessionId", type: "bytes32" },
    ],
  };

  async function futureDeadline() {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp + 3600;
  }

  async function pastDeadline() {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp - 1;
  }

  async function signPipelinePayment(payment, signer, { providers, amounts, totalAmount, nonce, expiry, service, sessionId }) {
    const domain = await getDomain(payment);
    const value = { providers, amounts, totalAmount, nonce, expiry, service, sessionId };
    return signer.signTypedData(domain, PIPELINE_TYPES, value);
  }

  const SESSION_ID = ethers.keccak256(ethers.toUtf8Bytes("test-session-1"));
  const SERVICE = "pipeline/llm/llama-3.1-8b";

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      const { payment, owner } = await loadFixture(deployPipelinePayment);
      expect(await payment.owner()).to.equal(owner.address);
    });

    it("should set the correct treasury", async function () {
      const { payment, treasury } = await loadFixture(deployPipelinePayment);
      expect(await payment.treasury()).to.equal(treasury.address);
    });

    it("should set the correct platform fee", async function () {
      const { payment } = await loadFixture(deployPipelinePayment);
      expect(await payment.platformFeeBps()).to.equal(PLATFORM_FEE_BPS);
    });

    it("should have zero total sessions initially", async function () {
      const { payment } = await loadFixture(deployPipelinePayment);
      expect(await payment.totalSessions()).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ETH PIPELINE PAYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("ETH Pipeline Payment", function () {
    it("should distribute ETH to multiple providers", async function () {
      const { payment, provider1, provider2, provider3, consumer1 } = await loadFixture(deployPipelinePayment);

      const providers = [provider1.address, provider2.address, provider3.address];
      const amounts = [ethers.parseEther("0.03"), ethers.parseEther("0.04"), ethers.parseEther("0.03")];
      const totalAmount = ethers.parseEther("0.1");
      const nonce = 1n;
      const expiry = await futureDeadline();

      const signature = await signPipelinePayment(payment, consumer1, {
        providers, amounts, totalAmount, nonce, expiry,
        service: SERVICE, sessionId: SESSION_ID,
      });

      await payment.connect(consumer1).processPipelinePaymentETH(
        consumer1.address, providers, amounts, totalAmount,
        nonce, expiry, SERVICE, SESSION_ID, signature,
        { value: totalAmount },
      );

      // Platform fee = 2.5% of 0.1 ETH = 0.0025 ETH
      const platformFee = (totalAmount * PLATFORM_FEE_BPS) / 10000n;
      const distributable = totalAmount - platformFee;

      // Each provider gets proportional share of distributable amount
      const p1Expected = (distributable * amounts[0]) / totalAmount;
      const p2Expected = (distributable * amounts[1]) / totalAmount;
      const p3Expected = (distributable * amounts[2]) / totalAmount;

      expect(await payment.pendingWithdrawalsETH(provider1.address)).to.equal(p1Expected);
      expect(await payment.pendingWithdrawalsETH(provider2.address)).to.equal(p2Expected);
      expect(await payment.pendingWithdrawalsETH(provider3.address)).to.equal(p3Expected);
    });

    it("should send platform fee to treasury", async function () {
      const { payment, treasury, provider1, provider2, consumer1 } = await loadFixture(deployPipelinePayment);

      const providers = [provider1.address, provider2.address];
      const amounts = [ethers.parseEther("0.05"), ethers.parseEther("0.05")];
      const totalAmount = ethers.parseEther("0.1");
      const nonce = 1n;
      const expiry = await futureDeadline();

      const signature = await signPipelinePayment(payment, consumer1, {
        providers, amounts, totalAmount, nonce, expiry,
        service: SERVICE, sessionId: SESSION_ID,
      });

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      await payment.connect(consumer1).processPipelinePaymentETH(
        consumer1.address, providers, amounts, totalAmount,
        nonce, expiry, SERVICE, SESSION_ID, signature,
        { value: totalAmount },
      );
      const treasuryAfter = await ethers.provider.getBalance(treasury.address);

      const expectedFee = (totalAmount * PLATFORM_FEE_BPS) / 10000n;
      expect(treasuryAfter - treasuryBefore).to.equal(expectedFee);
    });

    it("should increment totalSessions", async function () {
      const { payment, provider1, consumer1 } = await loadFixture(deployPipelinePayment);

      const totalAmount = ethers.parseEther("0.1");
      const expiry = await futureDeadline();
      const signature = await signPipelinePayment(payment, consumer1, {
        providers: [provider1.address], amounts: [totalAmount], totalAmount,
        nonce: 1n, expiry, service: SERVICE, sessionId: SESSION_ID,
      });

      await payment.connect(consumer1).processPipelinePaymentETH(
        consumer1.address, [provider1.address], [totalAmount], totalAmount,
        1n, expiry, SERVICE, SESSION_ID, signature,
        { value: totalAmount },
      );

      expect(await payment.totalSessions()).to.equal(1);
    });

    it("should emit PipelinePaymentProcessed and ProviderPaid events", async function () {
      const { payment, provider1, provider2, consumer1 } = await loadFixture(deployPipelinePayment);

      const providers = [provider1.address, provider2.address];
      const amounts = [ethers.parseEther("0.06"), ethers.parseEther("0.04")];
      const totalAmount = ethers.parseEther("0.1");
      const expiry = await futureDeadline();

      const signature = await signPipelinePayment(payment, consumer1, {
        providers, amounts, totalAmount, nonce: 1n, expiry,
        service: SERVICE, sessionId: SESSION_ID,
      });

      const tx = payment.connect(consumer1).processPipelinePaymentETH(
        consumer1.address, providers, amounts, totalAmount,
        1n, expiry, SERVICE, SESSION_ID, signature,
        { value: totalAmount },
      );

      await expect(tx).to.emit(payment, "PipelinePaymentProcessed");
      await expect(tx).to.emit(payment, "ProviderPaid").withArgs(SESSION_ID, provider1.address, () => true);
      await expect(tx).to.emit(payment, "ProviderPaid").withArgs(SESSION_ID, provider2.address, () => true);
    });

    it("should allow provider to withdraw ETH earnings", async function () {
      const { payment, provider1, consumer1 } = await loadFixture(deployPipelinePayment);

      const totalAmount = ethers.parseEther("0.1");
      const expiry = await futureDeadline();
      const signature = await signPipelinePayment(payment, consumer1, {
        providers: [provider1.address], amounts: [totalAmount], totalAmount,
        nonce: 1n, expiry, service: SERVICE, sessionId: SESSION_ID,
      });

      await payment.connect(consumer1).processPipelinePaymentETH(
        consumer1.address, [provider1.address], [totalAmount], totalAmount,
        1n, expiry, SERVICE, SESSION_ID, signature,
        { value: totalAmount },
      );

      const pending = await payment.pendingWithdrawalsETH(provider1.address);
      expect(pending).to.be.gt(0);

      const balBefore = await ethers.provider.getBalance(provider1.address);
      const tx = await payment.connect(provider1).withdrawETH();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const balAfter = await ethers.provider.getBalance(provider1.address);

      expect(balAfter - balBefore + gasCost).to.equal(pending);
      expect(await payment.pendingWithdrawalsETH(provider1.address)).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Validation", function () {
    it("should reject expired payment", async function () {
      const { payment, provider1, consumer1 } = await loadFixture(deployPipelinePayment);

      const totalAmount = ethers.parseEther("0.1");
      const expiry = await pastDeadline();
      const signature = await signPipelinePayment(payment, consumer1, {
        providers: [provider1.address], amounts: [totalAmount], totalAmount,
        nonce: 1n, expiry, service: SERVICE, sessionId: SESSION_ID,
      });

      await expect(
        payment.connect(consumer1).processPipelinePaymentETH(
          consumer1.address, [provider1.address], [totalAmount], totalAmount,
          1n, expiry, SERVICE, SESSION_ID, signature,
          { value: totalAmount },
        )
      ).to.be.revertedWith("Payment expired");
    });

    it("should reject nonce replay", async function () {
      const { payment, provider1, consumer1 } = await loadFixture(deployPipelinePayment);

      const totalAmount = ethers.parseEther("0.1");
      const expiry = await futureDeadline();
      const nonce = 42n;
      const signature = await signPipelinePayment(payment, consumer1, {
        providers: [provider1.address], amounts: [totalAmount], totalAmount,
        nonce, expiry, service: SERVICE, sessionId: SESSION_ID,
      });

      // First call succeeds
      await payment.connect(consumer1).processPipelinePaymentETH(
        consumer1.address, [provider1.address], [totalAmount], totalAmount,
        nonce, expiry, SERVICE, SESSION_ID, signature,
        { value: totalAmount },
      );

      // Second call with same nonce fails
      await expect(
        payment.connect(consumer1).processPipelinePaymentETH(
          consumer1.address, [provider1.address], [totalAmount], totalAmount,
          nonce, expiry, SERVICE, SESSION_ID, signature,
          { value: totalAmount },
        )
      ).to.be.revertedWith("Nonce already used");
    });

    it("should reject invalid signature", async function () {
      const { payment, provider1, provider2, consumer1 } = await loadFixture(deployPipelinePayment);

      const totalAmount = ethers.parseEther("0.1");
      const expiry = await futureDeadline();

      // Sign with provider2 but claim consumer1 is the signer
      const signature = await signPipelinePayment(payment, provider2, {
        providers: [provider1.address], amounts: [totalAmount], totalAmount,
        nonce: 1n, expiry, service: SERVICE, sessionId: SESSION_ID,
      });

      await expect(
        payment.connect(consumer1).processPipelinePaymentETH(
          consumer1.address, [provider1.address], [totalAmount], totalAmount,
          1n, expiry, SERVICE, SESSION_ID, signature,
          { value: totalAmount },
        )
      ).to.be.revertedWith("Invalid signature");
    });

    it("should reject zero amount", async function () {
      const { payment, provider1, consumer1 } = await loadFixture(deployPipelinePayment);

      const expiry = await futureDeadline();
      const signature = await signPipelinePayment(payment, consumer1, {
        providers: [provider1.address], amounts: [0n], totalAmount: 0n,
        nonce: 1n, expiry, service: SERVICE, sessionId: SESSION_ID,
      });

      await expect(
        payment.connect(consumer1).processPipelinePaymentETH(
          consumer1.address, [provider1.address], [0n], 0n,
          1n, expiry, SERVICE, SESSION_ID, signature,
          { value: 0n },
        )
      ).to.be.revertedWith("Zero amount");
    });

    it("should reject array length mismatch", async function () {
      const { payment, provider1, provider2, consumer1 } = await loadFixture(deployPipelinePayment);

      const totalAmount = ethers.parseEther("0.1");
      const expiry = await futureDeadline();

      // 2 providers but only 1 amount
      const signature = await signPipelinePayment(payment, consumer1, {
        providers: [provider1.address, provider2.address], amounts: [totalAmount], totalAmount,
        nonce: 1n, expiry, service: SERVICE, sessionId: SESSION_ID,
      });

      await expect(
        payment.connect(consumer1).processPipelinePaymentETH(
          consumer1.address, [provider1.address, provider2.address], [totalAmount], totalAmount,
          1n, expiry, SERVICE, SESSION_ID, signature,
          { value: totalAmount },
        )
      ).to.be.revertedWith("Array length mismatch");
    });

    it("should reject amounts that don't sum to totalAmount", async function () {
      const { payment, provider1, provider2, consumer1 } = await loadFixture(deployPipelinePayment);

      const expiry = await futureDeadline();
      const amounts = [ethers.parseEther("0.03"), ethers.parseEther("0.04")];
      const wrongTotal = ethers.parseEther("0.1"); // should be 0.07

      const signature = await signPipelinePayment(payment, consumer1, {
        providers: [provider1.address, provider2.address], amounts, totalAmount: wrongTotal,
        nonce: 1n, expiry, service: SERVICE, sessionId: SESSION_ID,
      });

      await expect(
        payment.connect(consumer1).processPipelinePaymentETH(
          consumer1.address, [provider1.address, provider2.address], amounts, wrongTotal,
          1n, expiry, SERVICE, SESSION_ID, signature,
          { value: wrongTotal },
        )
      ).to.be.revertedWith("Amounts don't sum to totalAmount");
    });

    it("should reject empty providers array", async function () {
      const { payment, consumer1 } = await loadFixture(deployPipelinePayment);

      const expiry = await futureDeadline();
      const signature = await signPipelinePayment(payment, consumer1, {
        providers: [], amounts: [], totalAmount: 0n,
        nonce: 1n, expiry, service: SERVICE, sessionId: SESSION_ID,
      });

      await expect(
        payment.connect(consumer1).processPipelinePaymentETH(
          consumer1.address, [], [], 0n,
          1n, expiry, SERVICE, SESSION_ID, signature,
          { value: 0n },
        )
      ).to.be.revertedWith("No providers");
    });

    it("should reject insufficient ETH", async function () {
      const { payment, provider1, consumer1 } = await loadFixture(deployPipelinePayment);

      const totalAmount = ethers.parseEther("0.1");
      const expiry = await futureDeadline();
      const signature = await signPipelinePayment(payment, consumer1, {
        providers: [provider1.address], amounts: [totalAmount], totalAmount,
        nonce: 1n, expiry, service: SERVICE, sessionId: SESSION_ID,
      });

      await expect(
        payment.connect(consumer1).processPipelinePaymentETH(
          consumer1.address, [provider1.address], [totalAmount], totalAmount,
          1n, expiry, SERVICE, SESSION_ID, signature,
          { value: ethers.parseEther("0.01") }, // too little
        )
      ).to.be.revertedWith("Insufficient ETH sent");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN
  // ═══════���═══════════════════════════════════════════════════════════════════

  describe("Admin", function () {
    it("should allow owner to update platform fee", async function () {
      const { payment, owner } = await loadFixture(deployPipelinePayment);
      await payment.connect(owner).setPlatformFee(500n);
      expect(await payment.platformFeeBps()).to.equal(500n);
    });

    it("should reject fee above 10%", async function () {
      const { payment, owner } = await loadFixture(deployPipelinePayment);
      await expect(payment.connect(owner).setPlatformFee(1001n)).to.be.revertedWith("Fee too high");
    });

    it("should allow owner to update treasury", async function () {
      const { payment, owner, provider1 } = await loadFixture(deployPipelinePayment);
      await payment.connect(owner).setTreasury(provider1.address);
      expect(await payment.treasury()).to.equal(provider1.address);
    });

    it("should reject non-owner admin calls", async function () {
      const { payment, consumer1 } = await loadFixture(deployPipelinePayment);
      await expect(payment.connect(consumer1).setPlatformFee(100n)).to.be.reverted;
    });
  });
});
